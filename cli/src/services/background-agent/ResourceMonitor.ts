// kilocode_change - new file
import { EventEmitter } from "events"
import * as os from "os"
import { logs } from "../logs.js"
import type { ResourceMetrics, ResourceLimits } from "./types.js"

/**
 * Monitors system resources and enforces limits
 */
export class ResourceMonitor extends EventEmitter {
	private limits: ResourceLimits
	private intervalId: ReturnType<typeof setInterval> | null = null
	private lastMetrics: ResourceMetrics | null = null
	private warningCount = 0
	private readonly warningThreshold = 3

	constructor(limits: ResourceLimits) {
		super()
		this.limits = limits
	}

	/**
	 * Start monitoring resources
	 */
	start(intervalMs: number = 5000): void {
		if (this.intervalId) {
			logs.warn("Resource monitor already running", "ResourceMonitor")
			return
		}

		logs.info("Starting resource monitor", "ResourceMonitor", {
			intervalMs,
			limits: this.limits,
		})

		// Collect initial metrics
		this.collectMetrics()

		// Set up periodic collection
		this.intervalId = setInterval(() => {
			this.collectMetrics()
		}, intervalMs)
	}

	/**
	 * Stop monitoring resources
	 */
	stop(): void {
		if (this.intervalId) {
			clearInterval(this.intervalId)
			this.intervalId = null
			logs.info("Resource monitor stopped", "ResourceMonitor")
		}
	}

	/**
	 * Collect current resource metrics
	 */
	private collectMetrics(): void {
		const metrics = this.getCurrentMetrics()
		this.lastMetrics = metrics

		// Check against limits
		this.checkLimits(metrics)

		this.emit("metrics", metrics)
	}

	/**
	 * Get current resource metrics
	 */
	private getCurrentMetrics(): ResourceMetrics {
		const cpuUsage = this.getCpuUsage()
		const memoryUsage = this.getMemoryUsage()
		const activeProcesses = this.getActiveProcessCount()

		return {
			cpuUsage,
			memoryUsage,
			activeProcesses,
			timestamp: new Date(),
		}
	}

	/**
	 * Get CPU usage percentage
	 */
	private getCpuUsage(): number {
		const cpus = os.cpus()
		let totalIdle = 0
		let totalTick = 0

		for (const cpu of cpus) {
			for (const type in cpu.times) {
				totalTick += cpu.times[type as keyof typeof cpu.times]
			}
			totalIdle += cpu.times.idle
		}

		// Return percentage of time NOT idle
		const usage = 100 - (totalIdle / totalTick) * 100
		return Math.round(usage * 10) / 10 // Round to 1 decimal
	}

	/**
	 * Get memory usage in bytes
	 */
	private getMemoryUsage(): number {
		const totalMem = os.totalmem()
		const freeMem = os.freemem()
		return totalMem - freeMem
	}

	/**
	 * Get active process count (simplified - counts Node.js processes)
	 */
	private getActiveProcessCount(): number {
		// In a real implementation, we would use ps-list or similar
		// For now, return a placeholder based on load average
		const loadAvgArr = os.loadavg()
		const loadAvg = loadAvgArr[0] ?? 0 // 1 minute load average
		return Math.ceil(loadAvg)
	}

	/**
	 * Check metrics against limits
	 */
	private checkLimits(metrics: ResourceMetrics): void {
		const warnings: string[] = []

		if (metrics.cpuUsage > this.limits.maxCpuPercent) {
			warnings.push(`CPU usage ${metrics.cpuUsage}% exceeds limit ${this.limits.maxCpuPercent}%`)
		}

		if (metrics.memoryUsage > this.limits.maxMemoryBytes) {
			const usedMB = Math.round(metrics.memoryUsage / 1024 / 1024)
			const limitMB = Math.round(this.limits.maxMemoryBytes / 1024 / 1024)
			warnings.push(`Memory usage ${usedMB}MB exceeds limit ${limitMB}MB`)
		}

		if (warnings.length > 0) {
			this.warningCount++

			if (this.warningCount >= this.warningThreshold) {
				logs.warn("Resource limits exceeded", "ResourceMonitor", {
					warnings,
					metrics,
				})
				this.emit("warning", { warnings, metrics })
				this.warningCount = 0
			}
		} else {
			this.warningCount = Math.max(0, this.warningCount - 1)
		}
	}

	/**
	 * Check if resources are available for a new task
	 */
	canAcceptNewTask(currentTaskCount: number): { allowed: boolean; reason?: string } {
		if (!this.lastMetrics) {
			// No metrics yet, allow the task
			return { allowed: true }
		}

		// Check task count limit
		if (currentTaskCount >= this.limits.maxConcurrentTasks) {
			return {
				allowed: false,
				reason: `Maximum concurrent tasks (${this.limits.maxConcurrentTasks}) reached`,
			}
		}

		// Check CPU limit (with headroom for new task)
		const cpuHeadroom = 10 // Allow up to 10% over limit temporarily
		if (this.lastMetrics.cpuUsage > this.limits.maxCpuPercent + cpuHeadroom) {
			return {
				allowed: false,
				reason: `CPU usage (${this.lastMetrics.cpuUsage}%) too high`,
			}
		}

		// Check memory limit (with 5% headroom)
		const memoryHeadroom = this.limits.maxMemoryBytes * 0.05
		if (this.lastMetrics.memoryUsage > this.limits.maxMemoryBytes - memoryHeadroom) {
			return {
				allowed: false,
				reason: "Memory usage too high",
			}
		}

		return { allowed: true }
	}

	/**
	 * Get the last collected metrics
	 */
	getMetrics(): ResourceMetrics | null {
		return this.lastMetrics
	}

	/**
	 * Get current resource limits
	 */
	getLimits(): ResourceLimits {
		return { ...this.limits }
	}

	/**
	 * Update resource limits
	 */
	updateLimits(limits: Partial<ResourceLimits>): void {
		this.limits = {
			...this.limits,
			...limits,
		}
		logs.debug("Resource limits updated", "ResourceMonitor", { limits: this.limits })
	}

	/**
	 * Get a summary of current resource usage
	 */
	getSummary(): {
		cpu: { usage: number; limit: number; status: string }
		memory: { usedMB: number; limitMB: number; status: string }
		tasks: { limit: number }
	} {
		const metrics = this.lastMetrics || {
			cpuUsage: 0,
			memoryUsage: 0,
			activeProcesses: 0,
			timestamp: new Date(),
		}

		const cpuStatus =
			metrics.cpuUsage > this.limits.maxCpuPercent
				? "critical"
				: metrics.cpuUsage > this.limits.maxCpuPercent * 0.8
					? "warning"
					: "ok"

		const memoryStatus =
			metrics.memoryUsage > this.limits.maxMemoryBytes
				? "critical"
				: metrics.memoryUsage > this.limits.maxMemoryBytes * 0.8
					? "warning"
					: "ok"

		return {
			cpu: {
				usage: metrics.cpuUsage,
				limit: this.limits.maxCpuPercent,
				status: cpuStatus,
			},
			memory: {
				usedMB: Math.round(metrics.memoryUsage / 1024 / 1024),
				limitMB: Math.round(this.limits.maxMemoryBytes / 1024 / 1024),
				status: memoryStatus,
			},
			tasks: {
				limit: this.limits.maxConcurrentTasks,
			},
		}
	}

	/**
	 * Dispose and clean up
	 */
	dispose(): void {
		this.stop()
		this.removeAllListeners()
		logs.debug("Resource monitor disposed", "ResourceMonitor")
	}
}
