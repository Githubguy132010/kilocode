// kilocode_change - new file
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { ResourceMonitor } from "../ResourceMonitor.js"
import type { ResourceLimits } from "../types.js"

// Mock os module
vi.mock("os", () => ({
	cpus: vi.fn(() => [
		{ times: { user: 100, nice: 0, sys: 50, idle: 850, irq: 0 } },
		{ times: { user: 100, nice: 0, sys: 50, idle: 850, irq: 0 } },
	]),
	totalmem: vi.fn(() => 8 * 1024 * 1024 * 1024), // 8GB
	freemem: vi.fn(() => 4 * 1024 * 1024 * 1024), // 4GB free
	loadavg: vi.fn(() => [1.5, 2.0, 2.5]),
}))

// Mock logs
vi.mock("../../logs.js", () => ({
	logs: {
		info: vi.fn(),
		debug: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
}))

describe("ResourceMonitor", () => {
	let monitor: ResourceMonitor
	const defaultLimits: ResourceLimits = {
		maxCpuPercent: 80,
		maxMemoryBytes: 6 * 1024 * 1024 * 1024, // 6GB
		maxConcurrentTasks: 3,
		maxQueueSize: 50,
	}

	beforeEach(() => {
		vi.clearAllMocks()
		vi.useFakeTimers()
		monitor = new ResourceMonitor(defaultLimits)
	})

	afterEach(() => {
		monitor.dispose()
		vi.useRealTimers()
	})

	describe("constructor", () => {
		it("should create monitor with specified limits", () => {
			const limits = monitor.getLimits()
			expect(limits.maxCpuPercent).toBe(80)
			expect(limits.maxMemoryBytes).toBe(6 * 1024 * 1024 * 1024)
			expect(limits.maxConcurrentTasks).toBe(3)
		})
	})

	describe("start", () => {
		it("should collect initial metrics", () => {
			const metricsHandler = vi.fn()
			monitor.on("metrics", metricsHandler)

			monitor.start(1000)

			expect(metricsHandler).toHaveBeenCalled()
		})

		it("should collect metrics periodically", () => {
			const metricsHandler = vi.fn()
			monitor.on("metrics", metricsHandler)

			monitor.start(1000)
			vi.advanceTimersByTime(3000)

			expect(metricsHandler.mock.calls.length).toBeGreaterThanOrEqual(3)
		})

		it("should not start twice", () => {
			monitor.start(1000)
			monitor.start(1000) // Should log warning

			vi.advanceTimersByTime(3000)
			// Should only have one interval running
		})
	})

	describe("stop", () => {
		it("should stop collecting metrics", () => {
			const metricsHandler = vi.fn()
			monitor.on("metrics", metricsHandler)

			monitor.start(1000)
			metricsHandler.mockClear()

			monitor.stop()
			vi.advanceTimersByTime(3000)

			expect(metricsHandler).not.toHaveBeenCalled()
		})
	})

	describe("getMetrics", () => {
		it("should return null before start", () => {
			expect(monitor.getMetrics()).toBeNull()
		})

		it("should return metrics after start", () => {
			monitor.start(1000)
			const metrics = monitor.getMetrics()

			expect(metrics).not.toBeNull()
			expect(metrics!.cpuUsage).toBeGreaterThanOrEqual(0)
			expect(metrics!.memoryUsage).toBeGreaterThan(0)
			expect(metrics!.timestamp).toBeInstanceOf(Date)
		})
	})

	describe("canAcceptNewTask", () => {
		it("should allow task when no metrics collected", () => {
			const result = monitor.canAcceptNewTask(0)
			expect(result.allowed).toBe(true)
		})

		it("should disallow when max concurrent reached", () => {
			monitor.start(1000)
			const result = monitor.canAcceptNewTask(3) // Max is 3
			expect(result.allowed).toBe(false)
			expect(result.reason).toContain("Maximum concurrent tasks")
		})

		it("should allow when under limits", () => {
			monitor.start(1000)
			const result = monitor.canAcceptNewTask(1)
			expect(result.allowed).toBe(true)
		})
	})

	describe("updateLimits", () => {
		it("should update limits", () => {
			monitor.updateLimits({ maxCpuPercent: 90 })
			const limits = monitor.getLimits()
			expect(limits.maxCpuPercent).toBe(90)
			expect(limits.maxMemoryBytes).toBe(6 * 1024 * 1024 * 1024) // Unchanged
		})
	})

	describe("getSummary", () => {
		it("should return resource summary", () => {
			monitor.start(1000)
			const summary = monitor.getSummary()

			expect(summary.cpu).toBeDefined()
			expect(summary.cpu.usage).toBeGreaterThanOrEqual(0)
			expect(summary.cpu.limit).toBe(80)
			expect(summary.cpu.status).toMatch(/^(ok|warning|critical)$/)

			expect(summary.memory).toBeDefined()
			expect(summary.memory.usedMB).toBeGreaterThan(0)
			expect(summary.memory.status).toMatch(/^(ok|warning|critical)$/)

			expect(summary.tasks.limit).toBe(3)
		})
	})

	describe("dispose", () => {
		it("should stop monitoring", () => {
			const metricsHandler = vi.fn()
			monitor.on("metrics", metricsHandler)

			monitor.start(1000)
			metricsHandler.mockClear()

			monitor.dispose()
			vi.advanceTimersByTime(3000)

			// Should not receive new metrics after dispose
			expect(metricsHandler).not.toHaveBeenCalled()
		})
	})
})
