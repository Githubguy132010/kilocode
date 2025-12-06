// kilocode_change - new file
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import {
	BackgroundAgentManager,
	getBackgroundAgentManager,
	resetBackgroundAgentManager,
} from "../BackgroundAgentManager.js"
import { TaskType, TaskPriority, TaskStatus } from "../types.js"

// Mock child_process.spawn
vi.mock("child_process", () => ({
	spawn: vi.fn(() => {
		const mockProcess = {
			stdout: { on: vi.fn() },
			stderr: { on: vi.fn() },
			on: vi.fn(),
			kill: vi.fn(),
			killed: false,
		}
		return mockProcess
	}),
}))

// Mock os module
vi.mock("os", () => ({
	cpus: vi.fn(() => [
		{ times: { user: 100, nice: 0, sys: 50, idle: 850, irq: 0 } },
		{ times: { user: 100, nice: 0, sys: 50, idle: 850, irq: 0 } },
	]),
	totalmem: vi.fn(() => 8 * 1024 * 1024 * 1024),
	freemem: vi.fn(() => 4 * 1024 * 1024 * 1024),
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

describe("BackgroundAgentManager", () => {
	let manager: BackgroundAgentManager

	beforeEach(() => {
		vi.clearAllMocks()
		vi.useFakeTimers()
		resetBackgroundAgentManager()
		manager = new BackgroundAgentManager()
	})

	afterEach(async () => {
		await manager.dispose()
		vi.useRealTimers()
	})

	describe("constructor", () => {
		it("should create manager with default config", () => {
			const stats = manager.getStats()
			expect(stats.maxConcurrent).toBe(3)
			expect(stats.isRunning).toBe(false)
		})

		it("should create manager with custom config", () => {
			const customManager = new BackgroundAgentManager({
				resourceLimits: {
					maxConcurrentTasks: 5,
					maxCpuPercent: 90,
					maxMemoryBytes: 2 * 1024 * 1024 * 1024,
					maxQueueSize: 100,
				},
			})

			const stats = customManager.getStats()
			expect(stats.maxConcurrent).toBe(5)

			customManager.dispose()
		})
	})

	describe("initialize", () => {
		it("should start the manager", async () => {
			await manager.initialize()
			expect(manager.isRunningState()).toBe(true)
		})

		it("should not initialize twice", async () => {
			await manager.initialize()
			await manager.initialize()
			expect(manager.isRunningState()).toBe(true)
		})
	})

	describe("queueTask", () => {
		beforeEach(async () => {
			await manager.initialize()
		})

		it("should queue a task and return ID", async () => {
			const taskId = await manager.queueTask({
				id: "test-task",
				type: TaskType.RESEARCH,
				description: "Test research",
				priority: TaskPriority.NORMAL,
				command: "Fetch Next.js version",
			})

			expect(taskId).toBe("test-task")
		})

		it("should generate ID if not provided", async () => {
			const taskId = await manager.queueTask({
				id: "",
				type: TaskType.RESEARCH,
				description: "Test research",
				priority: TaskPriority.NORMAL,
				command: "Fetch data",
			})

			expect(taskId).toBeTruthy()
		})

		it("should emit taskQueued event", async () => {
			const handler = vi.fn()
			manager.on("taskQueued", handler)

			await manager.queueTask({
				id: "test-task",
				type: TaskType.RESEARCH,
				description: "Test",
				priority: TaskPriority.NORMAL,
				command: "Test command",
			})

			expect(handler).toHaveBeenCalled()
		})

		it("should throw when queue is full", async () => {
			const customManager = new BackgroundAgentManager({
				resourceLimits: {
					maxConcurrentTasks: 3,
					maxCpuPercent: 80,
					maxMemoryBytes: 4 * 1024 * 1024 * 1024,
					maxQueueSize: 2,
				},
			})
			await customManager.initialize()

			// Pause to prevent auto-execution
			customManager.pause()

			await customManager.queueTask({
				id: "task-1",
				type: TaskType.RESEARCH,
				description: "Test 1",
				priority: TaskPriority.NORMAL,
				command: "Command 1",
			})

			await customManager.queueTask({
				id: "task-2",
				type: TaskType.RESEARCH,
				description: "Test 2",
				priority: TaskPriority.NORMAL,
				command: "Command 2",
			})

			await expect(
				customManager.queueTask({
					id: "task-3",
					type: TaskType.RESEARCH,
					description: "Test 3",
					priority: TaskPriority.NORMAL,
					command: "Command 3",
				}),
			).rejects.toThrow(/Queue is full/)

			await customManager.dispose()
		})
	})

	describe("cancelTask", () => {
		beforeEach(async () => {
			await manager.initialize()
			manager.pause()
		})

		it("should cancel a queued task", async () => {
			await manager.queueTask({
				id: "task-to-cancel",
				type: TaskType.RESEARCH,
				description: "Test",
				priority: TaskPriority.NORMAL,
				command: "Command",
			})

			const result = await manager.cancelTask("task-to-cancel")
			expect(result).toBe(true)
		})

		it("should return false for non-existent task", async () => {
			const result = await manager.cancelTask("non-existent")
			expect(result).toBe(false)
		})
	})

	describe("getTaskStatus", () => {
		beforeEach(async () => {
			await manager.initialize()
			manager.pause()
		})

		it("should return status of queued task", async () => {
			await manager.queueTask({
				id: "status-test",
				type: TaskType.RESEARCH,
				description: "Test",
				priority: TaskPriority.NORMAL,
				command: "Command",
			})

			const status = manager.getTaskStatus("status-test")
			expect(status).toBe(TaskStatus.QUEUED)
		})

		it("should return null for unknown task", () => {
			const status = manager.getTaskStatus("unknown")
			expect(status).toBeNull()
		})
	})

	describe("getRunningTasks", () => {
		it("should return empty array when no tasks running", async () => {
			await manager.initialize()
			const running = manager.getRunningTasks()
			expect(running).toEqual([])
		})
	})

	describe("getQueuedTasks", () => {
		beforeEach(async () => {
			await manager.initialize()
			manager.pause()
		})

		it("should return queued tasks", async () => {
			await manager.queueTask({
				id: "task-1",
				type: TaskType.RESEARCH,
				description: "Test 1",
				priority: TaskPriority.NORMAL,
				command: "Command 1",
			})

			await manager.queueTask({
				id: "task-2",
				type: TaskType.RESEARCH,
				description: "Test 2",
				priority: TaskPriority.HIGH,
				command: "Command 2",
			})

			const queued = manager.getQueuedTasks()
			expect(queued).toHaveLength(2)
			// Higher priority should be first
			expect(queued[0].id).toBe("task-2")
		})
	})

	describe("setSatisfactionCriteria", () => {
		it("should set criteria for task type", async () => {
			await manager.initialize()

			manager.setSatisfactionCriteria(TaskType.RESEARCH, {
				requiredFields: ["version", "releaseDate"],
				maxDataAgeMs: 3600000,
			})

			// No error thrown means success
		})
	})

	describe("pause and resume", () => {
		beforeEach(async () => {
			await manager.initialize()
		})

		it("should pause task execution", () => {
			manager.pause()
			expect(manager.getStats().isPaused).toBe(true)
		})

		it("should resume task execution", () => {
			manager.pause()
			manager.resume()
			expect(manager.getStats().isPaused).toBe(false)
		})
	})

	describe("getResourceMetrics", () => {
		beforeEach(async () => {
			await manager.initialize()
		})

		it("should return resource metrics", () => {
			const metrics = manager.getResourceMetrics()
			expect(metrics).toBeDefined()
			expect(metrics.cpuUsage).toBeGreaterThanOrEqual(0)
			expect(metrics.memoryUsage).toBeGreaterThan(0)
			expect(metrics.timestamp).toBeInstanceOf(Date)
		})
	})

	describe("updateConfig", () => {
		beforeEach(async () => {
			await manager.initialize()
		})

		it("should update resource limits", () => {
			manager.updateConfig({
				resourceLimits: {
					maxConcurrentTasks: 5,
					maxCpuPercent: 80,
					maxMemoryBytes: 4 * 1024 * 1024 * 1024,
					maxQueueSize: 50,
				},
			})

			expect(manager.getStats().maxConcurrent).toBe(5)
		})

		it("should update notification preferences", () => {
			manager.updateConfig({
				notificationPreferences: {
					showOnComplete: false,
					showOnError: true,
					showProgress: true,
					minPriorityForNotification: TaskPriority.HIGH,
				},
			})

			// No error means success
		})
	})

	describe("getStats", () => {
		beforeEach(async () => {
			await manager.initialize()
		})

		it("should return comprehensive stats", () => {
			const stats = manager.getStats()
			expect(stats).toEqual({
				queuedCount: 0,
				runningCount: 0,
				completedCount: 0,
				maxConcurrent: 3,
				isRunning: true,
				isPaused: false,
			})
		})
	})

	describe("convenience methods", () => {
		beforeEach(async () => {
			await manager.initialize()
			manager.pause() // Pause to prevent auto-execution
		})

		it("queueResearchTask should queue research task", async () => {
			const taskId = await manager.queueResearchTask("Research Next.js", {
				priority: TaskPriority.HIGH,
			})

			expect(taskId).toBeTruthy()
			const queued = manager.getQueuedTasks()
			expect(queued.some((t) => t.type === TaskType.RESEARCH)).toBe(true)
		})

		it("queueFetchTask should queue fetch task", async () => {
			const taskId = await manager.queueFetchTask("https://example.com/api")

			expect(taskId).toBeTruthy()
			const queued = manager.getQueuedTasks()
			expect(queued.some((t) => t.type === TaskType.FETCH_DATA)).toBe(true)
		})

		it("queueAnalysisTask should queue analysis task", async () => {
			const taskId = await manager.queueAnalysisTask("Analyze dependencies")

			expect(taskId).toBeTruthy()
			const queued = manager.getQueuedTasks()
			expect(queued.some((t) => t.type === TaskType.ANALYZE)).toBe(true)
		})
	})

	describe("dispose", () => {
		it("should clean up all resources", async () => {
			await manager.initialize()
			manager.pause()

			await manager.queueTask({
				id: "task-1",
				type: TaskType.RESEARCH,
				description: "Test",
				priority: TaskPriority.NORMAL,
				command: "Command",
			})

			await manager.dispose()

			expect(manager.isRunningState()).toBe(false)
		})
	})
})

describe("getBackgroundAgentManager singleton", () => {
	beforeEach(() => {
		resetBackgroundAgentManager()
	})

	afterEach(() => {
		resetBackgroundAgentManager()
	})

	it("should return the same instance", () => {
		const instance1 = getBackgroundAgentManager()
		const instance2 = getBackgroundAgentManager()

		expect(instance1).toBe(instance2)
	})

	it("should create with config on first call", () => {
		const instance = getBackgroundAgentManager({
			resourceLimits: {
				maxConcurrentTasks: 5,
				maxCpuPercent: 80,
				maxMemoryBytes: 4 * 1024 * 1024 * 1024,
				maxQueueSize: 50,
			},
		})

		expect(instance.getStats().maxConcurrent).toBe(5)
	})
})
