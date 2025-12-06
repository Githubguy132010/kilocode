// kilocode_change - new file
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { BackgroundTask } from "../BackgroundTask.js"
import { TaskType, TaskPriority, TaskStatus } from "../types.js"

// Mock child_process.spawn
vi.mock("child_process", () => ({
	spawn: vi.fn(() => {
		const mockProcess = {
			stdout: {
				on: vi.fn(),
			},
			stderr: {
				on: vi.fn(),
			},
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

describe("BackgroundTask", () => {
	let task: BackgroundTask

	beforeEach(() => {
		vi.clearAllMocks()
		task = new BackgroundTask({
			id: "test-task-1",
			type: TaskType.RESEARCH,
			description: "Test research task",
			priority: TaskPriority.NORMAL,
			command: "Fetch the latest Next.js version",
			timeoutMs: 5000,
		})
	})

	afterEach(() => {
		if (task) {
			task.dispose()
		}
	})

	describe("constructor", () => {
		it("should create a task with default values", () => {
			expect(task.getId()).toBe("test-task-1")
			expect(task.getStatus()).toBe(TaskStatus.PENDING)
			expect(task.getPriority()).toBe(TaskPriority.NORMAL)
		})

		it("should create a task with custom priority", () => {
			const highPriorityTask = new BackgroundTask({
				id: "high-priority-task",
				type: TaskType.ANALYZE,
				description: "High priority analysis",
				priority: TaskPriority.CRITICAL,
				command: "Analyze something important",
			})

			expect(highPriorityTask.getPriority()).toBe(TaskPriority.CRITICAL)
			highPriorityTask.dispose()
		})

		it("should use default timeout when not specified", () => {
			const taskWithoutTimeout = new BackgroundTask({
				id: "no-timeout-task",
				type: TaskType.FETCH_DATA,
				description: "No timeout specified",
				priority: TaskPriority.LOW,
				command: "Fetch some data",
			})

			const config = taskWithoutTimeout.getConfig()
			expect(config.timeoutMs).toBe(300000) // 5 minutes default
			taskWithoutTimeout.dispose()
		})
	})

	describe("getConfig", () => {
		it("should return a copy of the configuration", () => {
			const config = task.getConfig()
			expect(config.id).toBe("test-task-1")
			expect(config.type).toBe(TaskType.RESEARCH)
			expect(config.description).toBe("Test research task")
			expect(config.command).toBe("Fetch the latest Next.js version")
		})
	})

	describe("getStatus", () => {
		it("should return PENDING for new tasks", () => {
			expect(task.getStatus()).toBe(TaskStatus.PENDING)
		})
	})

	describe("cancel", () => {
		it("should set status to CANCELLED", () => {
			task.cancel()
			expect(task.getStatus()).toBe(TaskStatus.CANCELLED)
		})

		it("should emit cancelled event", () => {
			const cancelHandler = vi.fn()
			task.on("cancelled", cancelHandler)
			task.cancel()
			expect(cancelHandler).toHaveBeenCalledWith("test-task-1")
		})

		it("should not cancel already completed task", () => {
			// Manually set status to completed
			;(task as unknown as { status: TaskStatus }).status = TaskStatus.COMPLETED
			task.cancel()
			expect(task.getStatus()).toBe(TaskStatus.COMPLETED)
		})
	})

	describe("getOutput", () => {
		it("should return empty array for new task", () => {
			expect(task.getOutput()).toEqual([])
		})
	})

	describe("getErrorOutput", () => {
		it("should return empty array for new task", () => {
			expect(task.getErrorOutput()).toEqual([])
		})
	})

	describe("getResult", () => {
		it("should return null for new task", () => {
			expect(task.getResult()).toBeNull()
		})
	})

	describe("dispose", () => {
		it("should clean up resources", () => {
			const removeListenersSpy = vi.spyOn(task, "removeAllListeners")
			task.dispose()
			expect(removeListenersSpy).toHaveBeenCalled()
		})
	})
})
