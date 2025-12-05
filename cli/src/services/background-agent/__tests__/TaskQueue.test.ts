// kilocode_change - new file
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { TaskQueue } from "../TaskQueue.js"
import { BackgroundTask } from "../BackgroundTask.js"
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

// Mock logs
vi.mock("../../logs.js", () => ({
	logs: {
		info: vi.fn(),
		debug: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
}))

describe("TaskQueue", () => {
	let queue: TaskQueue

	beforeEach(() => {
		vi.clearAllMocks()
		queue = new TaskQueue(2) // Max 2 concurrent tasks
	})

	afterEach(() => {
		queue.dispose()
	})

	describe("constructor", () => {
		it("should create queue with specified concurrency", () => {
			const stats = queue.getStats()
			expect(stats.maxConcurrent).toBe(2)
		})

		it("should create queue with default concurrency", () => {
			const defaultQueue = new TaskQueue()
			const stats = defaultQueue.getStats()
			expect(stats.maxConcurrent).toBe(3) // Default is 3
			defaultQueue.dispose()
		})
	})

	describe("enqueue", () => {
		it("should add task to queue", () => {
			const task = createTask("task-1", TaskPriority.NORMAL)
			queue.enqueue(task)

			expect(queue.getStats().queuedCount + queue.getStats().runningCount).toBeGreaterThan(0)
		})

		it("should emit taskQueued event", () => {
			const handler = vi.fn()
			queue.on("taskQueued", handler)

			const task = createTask("task-1", TaskPriority.NORMAL)
			queue.enqueue(task)

			expect(handler).toHaveBeenCalled()
		})

		it("should order tasks by priority", () => {
			// Pause queue to prevent auto-execution
			queue.pause()

			const lowPriority = createTask("low", TaskPriority.LOW)
			const highPriority = createTask("high", TaskPriority.HIGH)
			const normalPriority = createTask("normal", TaskPriority.NORMAL)

			queue.enqueue(lowPriority)
			queue.enqueue(normalPriority)
			queue.enqueue(highPriority)

			const queued = queue.getQueuedTasks()
			expect(queued[0].id).toBe("high")
			expect(queued[1].id).toBe("normal")
			expect(queued[2].id).toBe("low")
		})
	})

	describe("cancelTask", () => {
		it("should cancel queued task", () => {
			queue.pause()
			const task = createTask("task-1", TaskPriority.NORMAL)
			queue.enqueue(task)

			const result = queue.cancelTask("task-1")
			expect(result).toBe(true)
		})

		it("should return false for non-existent task", () => {
			const result = queue.cancelTask("non-existent")
			expect(result).toBe(false)
		})
	})

	describe("cancelTasksByTag", () => {
		it("should cancel all tasks with matching tag", () => {
			queue.pause()

			const task1 = createTask("task-1", TaskPriority.NORMAL, ["research"])
			const task2 = createTask("task-2", TaskPriority.NORMAL, ["research"])
			const task3 = createTask("task-3", TaskPriority.NORMAL, ["other"])

			queue.enqueue(task1)
			queue.enqueue(task2)
			queue.enqueue(task3)

			const cancelled = queue.cancelTasksByTag("research")
			expect(cancelled).toBe(2)
		})
	})

	describe("getTaskStatus", () => {
		it("should return QUEUED for queued task", () => {
			queue.pause()
			const task = createTask("task-1", TaskPriority.NORMAL)
			queue.enqueue(task)

			expect(queue.getTaskStatus("task-1")).toBe(TaskStatus.QUEUED)
		})

		it("should return null for unknown task", () => {
			expect(queue.getTaskStatus("unknown")).toBeNull()
		})
	})

	describe("getStats", () => {
		it("should return correct statistics", () => {
			queue.pause()
			queue.enqueue(createTask("task-1", TaskPriority.NORMAL))
			queue.enqueue(createTask("task-2", TaskPriority.HIGH))

			const stats = queue.getStats()
			expect(stats.queuedCount).toBe(2)
			expect(stats.runningCount).toBe(0)
			expect(stats.completedCount).toBe(0)
		})
	})

	describe("pause and resume", () => {
		it("should pause queue processing", () => {
			queue.pause()
			expect(queue.isPausedState()).toBe(true)
		})

		it("should resume queue processing", () => {
			queue.pause()
			queue.resume()
			expect(queue.isPausedState()).toBe(false)
		})
	})

	describe("setMaxConcurrent", () => {
		it("should update max concurrent tasks", () => {
			queue.setMaxConcurrent(5)
			expect(queue.getStats().maxConcurrent).toBe(5)
		})

		it("should not allow less than 1", () => {
			queue.setMaxConcurrent(0)
			expect(queue.getStats().maxConcurrent).toBe(1)
		})
	})

	describe("clearCompleted", () => {
		it("should clear completed tasks history", () => {
			queue.clearCompleted()
			expect(queue.getStats().completedCount).toBe(0)
		})
	})

	describe("dispose", () => {
		it("should clean up all resources", () => {
			queue.pause()
			queue.enqueue(createTask("task-1", TaskPriority.NORMAL))
			queue.enqueue(createTask("task-2", TaskPriority.NORMAL))

			queue.dispose()

			expect(queue.getStats().queuedCount).toBe(0)
			expect(queue.getStats().runningCount).toBe(0)
		})
	})
})

// Helper function to create test tasks
function createTask(id: string, priority: TaskPriority, tags?: string[]): BackgroundTask {
	return new BackgroundTask({
		id,
		type: TaskType.RESEARCH,
		description: `Test task ${id}`,
		priority,
		command: `Test command for ${id}`,
		tags,
	})
}
