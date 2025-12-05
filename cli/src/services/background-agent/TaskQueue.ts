// kilocode_change - new file
import { EventEmitter } from "events"
import { logs } from "../logs.js"
import { BackgroundTask } from "./BackgroundTask.js"
import type { TaskConfig, TaskResult, TaskProgress } from "./types.js"
import { TaskStatus, TaskPriority } from "./types.js"

/**
 * Priority queue for managing background tasks
 * Supports task prioritization, conflict resolution, and concurrency limits
 */
export class TaskQueue extends EventEmitter {
	private queue: BackgroundTask[] = []
	private runningTasks: Map<string, BackgroundTask> = new Map()
	private completedTasks: Map<string, TaskResult> = new Map()
	private maxConcurrent: number
	private isPaused = false
	private taskConflicts: Map<string, Set<string>> = new Map() // tag -> conflicting task IDs

	constructor(maxConcurrent = 3) {
		super()
		this.maxConcurrent = maxConcurrent
	}

	/**
	 * Add a task to the queue
	 */
	enqueue(task: BackgroundTask): void {
		// Check for conflicts with running tasks
		const conflicts = this.checkConflicts(task)
		if (conflicts.length > 0) {
			logs.warn(`Task ${task.getId()} has conflicts with: ${conflicts.join(", ")}`, "TaskQueue")
			this.emit("taskConflict", { taskId: task.getId(), conflicts })
		}

		// Insert task based on priority (higher priority = earlier in queue)
		const insertIndex = this.findInsertIndex(task.getPriority())
		this.queue.splice(insertIndex, 0, task)

		logs.debug(`Task ${task.getId()} enqueued at position ${insertIndex}`, "TaskQueue", {
			queueLength: this.queue.length,
			priority: task.getPriority(),
		})

		this.emit("taskQueued", task.getConfig())
		this.trackTaskConflicts(task)

		// Try to process the queue
		void this.processQueue()
	}

	/**
	 * Find the correct insertion index for priority ordering
	 */
	private findInsertIndex(priority: number): number {
		for (let i = 0; i < this.queue.length; i++) {
			const queuedTask = this.queue[i]
			if (queuedTask && queuedTask.getPriority() < priority) {
				return i
			}
		}
		return this.queue.length
	}

	/**
	 * Check for conflicts with running tasks
	 */
	private checkConflicts(task: BackgroundTask): string[] {
		const conflicts: string[] = []
		const taskConfig = task.getConfig()

		// Check tags for conflicts
		if (taskConfig.tags) {
			for (const tag of taskConfig.tags) {
				const conflictingIds = this.taskConflicts.get(tag)
				if (conflictingIds) {
					for (const id of conflictingIds) {
						if (this.runningTasks.has(id)) {
							conflicts.push(id)
						}
					}
				}
			}
		}

		// Check for same parent task (overlapping follow-ups)
		if (taskConfig.parentTaskId) {
			for (const [id, runningTask] of this.runningTasks) {
				if (runningTask.getConfig().parentTaskId === taskConfig.parentTaskId) {
					conflicts.push(id)
				}
			}
		}

		return [...new Set(conflicts)]
	}

	/**
	 * Track task tags for conflict detection
	 */
	private trackTaskConflicts(task: BackgroundTask): void {
		const taskConfig = task.getConfig()
		if (taskConfig.tags) {
			for (const tag of taskConfig.tags) {
				if (!this.taskConflicts.has(tag)) {
					this.taskConflicts.set(tag, new Set())
				}
				this.taskConflicts.get(tag)!.add(task.getId())
			}
		}
	}

	/**
	 * Remove task from conflict tracking
	 */
	private untrackTaskConflicts(task: BackgroundTask): void {
		const taskConfig = task.getConfig()
		if (taskConfig.tags) {
			for (const tag of taskConfig.tags) {
				const conflictingIds = this.taskConflicts.get(tag)
				if (conflictingIds) {
					conflictingIds.delete(task.getId())
					if (conflictingIds.size === 0) {
						this.taskConflicts.delete(tag)
					}
				}
			}
		}
	}

	/**
	 * Process the queue and start tasks if possible
	 */
	async processQueue(): Promise<void> {
		if (this.isPaused) {
			logs.debug("Queue processing paused", "TaskQueue")
			return
		}

		while (this.runningTasks.size < this.maxConcurrent && this.queue.length > 0) {
			const task = this.queue.shift()
			if (!task) break

			await this.startTask(task)
		}
	}

	/**
	 * Start executing a task
	 */
	private async startTask(task: BackgroundTask): Promise<void> {
		const taskId = task.getId()
		this.runningTasks.set(taskId, task)

		logs.info(`Starting task: ${taskId}`, "TaskQueue", {
			runningCount: this.runningTasks.size,
			queuedCount: this.queue.length,
		})

		// Set up event listeners
		task.on("progress", (progress: TaskProgress) => {
			this.emit("taskProgress", progress)
		})

		task.on("completed", (result: TaskResult) => {
			this.handleTaskComplete(taskId, result)
		})

		task.on("failed", (result: TaskResult) => {
			this.handleTaskComplete(taskId, result)
		})

		task.on("cancelled", () => {
			this.handleTaskCancelled(taskId)
		})

		this.emit("taskStarted", task.getConfig())

		// Execute the task
		try {
			await task.execute()
		} catch (error) {
			logs.error(`Task ${taskId} threw an error`, "TaskQueue", { error })
			this.handleTaskComplete(taskId, {
				taskId,
				success: false,
				error: error instanceof Error ? error.message : String(error),
				executionTimeMs: 0,
				completedAt: new Date(),
			})
		}
	}

	/**
	 * Handle task completion
	 */
	private handleTaskComplete(taskId: string, result: TaskResult): void {
		const task = this.runningTasks.get(taskId)
		if (task) {
			this.runningTasks.delete(taskId)
			this.untrackTaskConflicts(task)
			this.completedTasks.set(taskId, result)
			task.dispose()
		}

		logs.info(`Task completed: ${taskId}`, "TaskQueue", {
			success: result.success,
			runningCount: this.runningTasks.size,
		})

		this.emit("taskCompleted", result)

		// Continue processing queue
		void this.processQueue()
	}

	/**
	 * Handle task cancellation
	 */
	private handleTaskCancelled(taskId: string): void {
		const task = this.runningTasks.get(taskId)
		if (task) {
			this.runningTasks.delete(taskId)
			this.untrackTaskConflicts(task)
			task.dispose()
		}

		logs.info(`Task cancelled: ${taskId}`, "TaskQueue")
		this.emit("taskCancelled", taskId)

		// Continue processing queue
		void this.processQueue()
	}

	/**
	 * Cancel a specific task
	 */
	cancelTask(taskId: string): boolean {
		// Check running tasks
		const runningTask = this.runningTasks.get(taskId)
		if (runningTask) {
			runningTask.cancel()
			return true
		}

		// Check queued tasks
		const queueIndex = this.queue.findIndex((t) => t.getId() === taskId)
		if (queueIndex !== -1) {
			const task = this.queue.splice(queueIndex, 1)[0]
			if (task) {
				task.cancel()
				task.dispose()
			}
			return true
		}

		return false
	}

	/**
	 * Cancel all tasks with a specific tag
	 */
	cancelTasksByTag(tag: string): number {
		let cancelled = 0

		// Cancel running tasks
		for (const [, task] of this.runningTasks) {
			const config = task.getConfig()
			if (config.tags?.includes(tag)) {
				task.cancel()
				cancelled++
			}
		}

		// Cancel queued tasks
		const toRemove: number[] = []
		this.queue.forEach((task, index) => {
			const config = task.getConfig()
			if (config.tags?.includes(tag)) {
				task.cancel()
				task.dispose()
				toRemove.push(index)
				cancelled++
			}
		})

		// Remove in reverse order to maintain indices
		for (let i = toRemove.length - 1; i >= 0; i--) {
			const idx = toRemove[i]
			if (idx !== undefined) {
				this.queue.splice(idx, 1)
			}
		}

		return cancelled
	}

	/**
	 * Get task status
	 */
	getTaskStatus(taskId: string): TaskStatus | null {
		// Check running tasks
		const runningTask = this.runningTasks.get(taskId)
		if (runningTask) {
			return runningTask.getStatus()
		}

		// Check queued tasks
		const queuedTask = this.queue.find((t) => t.getId() === taskId)
		if (queuedTask) {
			return TaskStatus.QUEUED
		}

		// Check completed tasks
		if (this.completedTasks.has(taskId)) {
			const result = this.completedTasks.get(taskId)!
			return result.success ? TaskStatus.COMPLETED : TaskStatus.FAILED
		}

		return null
	}

	/**
	 * Get task result
	 */
	getTaskResult(taskId: string): TaskResult | null {
		// Check running tasks first
		const runningTask = this.runningTasks.get(taskId)
		if (runningTask) {
			return runningTask.getResult()
		}

		// Check completed tasks
		return this.completedTasks.get(taskId) ?? null
	}

	/**
	 * Get all running tasks
	 */
	getRunningTasks(): TaskConfig[] {
		return Array.from(this.runningTasks.values()).map((t) => t.getConfig())
	}

	/**
	 * Get all queued tasks
	 */
	getQueuedTasks(): TaskConfig[] {
		return this.queue.map((t) => t.getConfig())
	}

	/**
	 * Get queue statistics
	 */
	getStats(): {
		queuedCount: number
		runningCount: number
		completedCount: number
		maxConcurrent: number
	} {
		return {
			queuedCount: this.queue.length,
			runningCount: this.runningTasks.size,
			completedCount: this.completedTasks.size,
			maxConcurrent: this.maxConcurrent,
		}
	}

	/**
	 * Pause queue processing
	 */
	pause(): void {
		this.isPaused = true
		logs.info("Task queue paused", "TaskQueue")
		this.emit("paused")
	}

	/**
	 * Resume queue processing
	 */
	resume(): void {
		this.isPaused = false
		logs.info("Task queue resumed", "TaskQueue")
		this.emit("resumed")
		void this.processQueue()
	}

	/**
	 * Pause all running tasks
	 */
	pauseAllTasks(): void {
		for (const task of this.runningTasks.values()) {
			task.pause()
		}
	}

	/**
	 * Resume all paused tasks
	 */
	resumeAllTasks(): void {
		for (const task of this.runningTasks.values()) {
			task.resume()
		}
	}

	/**
	 * Check if the queue is paused
	 */
	isPausedState(): boolean {
		return this.isPaused
	}

	/**
	 * Update max concurrent tasks
	 */
	setMaxConcurrent(max: number): void {
		this.maxConcurrent = Math.max(1, max)
		logs.debug(`Max concurrent tasks updated to ${this.maxConcurrent}`, "TaskQueue")
		void this.processQueue()
	}

	/**
	 * Reprioritize a task
	 */
	reprioritize(taskId: string, newPriority: TaskPriority): boolean {
		// Can only reprioritize queued tasks
		const index = this.queue.findIndex((t) => t.getId() === taskId)
		if (index === -1) {
			return false
		}

		const task = this.queue[index]
		if (!task) {
			return false
		}

		const config = task.getConfig()

		// Remove from current position
		this.queue.splice(index, 1)

		// Update priority in config
		const updatedTask = new BackgroundTask({
			...config,
			priority: newPriority,
		})

		// Re-enqueue with new priority
		this.enqueue(updatedTask)

		// Clean up old task
		task.dispose()

		return true
	}

	/**
	 * Clear completed tasks history
	 */
	clearCompleted(): void {
		this.completedTasks.clear()
		logs.debug("Cleared completed tasks history", "TaskQueue")
	}

	/**
	 * Dispose and clean up
	 */
	dispose(): void {
		// Cancel all running tasks
		for (const task of this.runningTasks.values()) {
			task.cancel()
			task.dispose()
		}
		this.runningTasks.clear()

		// Dispose queued tasks
		for (const task of this.queue) {
			task.dispose()
		}
		this.queue = []

		// Clear history
		this.completedTasks.clear()
		this.taskConflicts.clear()

		this.removeAllListeners()
		logs.info("Task queue disposed", "TaskQueue")
	}
}
