// kilocode_change - new file
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { NotificationService } from "../NotificationService.js"
import { NotificationType, TaskPriority } from "../types.js"
import type { TaskResult, NotificationPreferences } from "../types.js"

// Mock logs
vi.mock("../../logs.js", () => ({
	logs: {
		info: vi.fn(),
		debug: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
}))

describe("NotificationService", () => {
	let service: NotificationService
	const defaultPreferences: NotificationPreferences = {
		showOnComplete: true,
		showOnError: true,
		showProgress: false,
		minPriorityForNotification: TaskPriority.NORMAL,
	}

	beforeEach(() => {
		vi.clearAllMocks()
		service = new NotificationService(defaultPreferences)
	})

	afterEach(() => {
		service.dispose()
	})

	describe("constructor", () => {
		it("should create service with preferences", () => {
			const prefs = service.getPreferences()
			expect(prefs.showOnComplete).toBe(true)
			expect(prefs.showOnError).toBe(true)
		})
	})

	describe("updatePreferences", () => {
		it("should update preferences", () => {
			service.updatePreferences({ showOnComplete: false })
			const prefs = service.getPreferences()
			expect(prefs.showOnComplete).toBe(false)
			expect(prefs.showOnError).toBe(true) // Unchanged
		})
	})

	describe("setExtensionIdle", () => {
		it("should track idle state", () => {
			service.setExtensionIdle(true)
			expect(service.isExtensionIdle()).toBe(true)
		})

		it("should deliver pending notifications when becoming active", () => {
			const handler = vi.fn()
			service.on("notification", handler)

			// Set idle and queue notifications
			service.setExtensionIdle(true)
			service.notify(NotificationType.INFO, "Test", "Message 1")
			service.notify(NotificationType.INFO, "Test", "Message 2")

			expect(handler).not.toHaveBeenCalled()

			// Become active
			service.setExtensionIdle(false)
			expect(handler).toHaveBeenCalled()
		})
	})

	describe("notifyTaskCompleted", () => {
		it("should emit notification for completed task", () => {
			const handler = vi.fn()
			service.on("notification", handler)

			const result: TaskResult = {
				taskId: "task-1",
				success: true,
				executionTimeMs: 1500,
				completedAt: new Date(),
			}

			service.notifyTaskCompleted(result, TaskPriority.NORMAL)

			expect(handler).toHaveBeenCalled()
			const notification = handler.mock.calls[0][0]
			expect(notification.type).toBe(NotificationType.TASK_COMPLETED)
			expect(notification.taskId).toBe("task-1")
		})

		it("should not notify for low priority tasks below threshold", () => {
			const handler = vi.fn()
			service.on("notification", handler)

			service.updatePreferences({ minPriorityForNotification: TaskPriority.HIGH })

			const result: TaskResult = {
				taskId: "task-1",
				success: true,
				executionTimeMs: 1500,
				completedAt: new Date(),
			}

			service.notifyTaskCompleted(result, TaskPriority.NORMAL)

			expect(handler).not.toHaveBeenCalled()
		})

		it("should not notify when showOnComplete is false", () => {
			const handler = vi.fn()
			service.on("notification", handler)

			service.updatePreferences({ showOnComplete: false })

			const result: TaskResult = {
				taskId: "task-1",
				success: true,
				executionTimeMs: 1500,
				completedAt: new Date(),
			}

			service.notifyTaskCompleted(result, TaskPriority.NORMAL)

			expect(handler).not.toHaveBeenCalled()
		})
	})

	describe("notifyTaskFailed", () => {
		it("should emit notification for failed task", () => {
			const handler = vi.fn()
			service.on("notification", handler)

			service.notifyTaskFailed("task-1", "Connection timeout", TaskPriority.HIGH)

			expect(handler).toHaveBeenCalled()
			const notification = handler.mock.calls[0][0]
			expect(notification.type).toBe(NotificationType.TASK_FAILED)
			expect(notification.message).toContain("Connection timeout")
			expect(notification.persistent).toBe(true)
		})

		it("should not notify when showOnError is false", () => {
			const handler = vi.fn()
			service.on("notification", handler)

			service.updatePreferences({ showOnError: false })
			service.notifyTaskFailed("task-1", "Error", TaskPriority.HIGH)

			expect(handler).not.toHaveBeenCalled()
		})
	})

	describe("notify", () => {
		it("should send general notification", () => {
			const handler = vi.fn()
			service.on("notification", handler)

			service.notify(NotificationType.WARNING, "Warning", "Something happened")

			expect(handler).toHaveBeenCalled()
			const notification = handler.mock.calls[0][0]
			expect(notification.type).toBe(NotificationType.WARNING)
			expect(notification.title).toBe("Warning")
		})

		it("should include custom actions", () => {
			const handler = vi.fn()
			service.on("notification", handler)

			service.notify(NotificationType.INFO, "Info", "Message", {
				actions: [
					{ id: "action1", label: "Action 1", primary: true },
					{ id: "action2", label: "Action 2" },
				],
			})

			const notification = handler.mock.calls[0][0]
			expect(notification.actions).toHaveLength(2)
			expect(notification.actions[0].primary).toBe(true)
		})
	})

	describe("handleAction", () => {
		it("should emit action event", () => {
			const notificationHandler = vi.fn()
			const actionHandler = vi.fn()
			service.on("notification", notificationHandler)
			service.on("action", actionHandler)

			service.notify(NotificationType.INFO, "Test", "Message", { persistent: true })
			const notification = notificationHandler.mock.calls[0][0]

			service.handleAction(notification.id, "dismiss")

			expect(actionHandler).toHaveBeenCalled()
		})

		it("should auto-dismiss non-persistent notifications", () => {
			const notificationHandler = vi.fn()
			const dismissHandler = vi.fn()
			service.on("notification", notificationHandler)
			service.on("dismissed", dismissHandler)

			service.notify(NotificationType.INFO, "Test", "Message", { persistent: false })
			const notification = notificationHandler.mock.calls[0][0]

			service.handleAction(notification.id, "any-action")

			expect(dismissHandler).toHaveBeenCalledWith(notification.id)
		})
	})

	describe("dismiss", () => {
		it("should remove notification", () => {
			const notificationHandler = vi.fn()
			service.on("notification", notificationHandler)

			service.notify(NotificationType.INFO, "Test", "Message")
			const notification = notificationHandler.mock.calls[0][0]

			expect(service.getNotifications()).toHaveLength(1)

			service.dismiss(notification.id)

			expect(service.getNotifications()).toHaveLength(0)
		})
	})

	describe("dismissAll", () => {
		it("should remove all notifications", () => {
			service.notify(NotificationType.INFO, "Test 1", "Message")
			service.notify(NotificationType.INFO, "Test 2", "Message")
			service.notify(NotificationType.INFO, "Test 3", "Message")

			expect(service.getNotifications().length).toBeGreaterThan(0)

			service.dismissAll()

			expect(service.getNotifications()).toHaveLength(0)
		})
	})

	describe("getPendingCount", () => {
		it("should return count of pending notifications", () => {
			service.setExtensionIdle(true)
			service.notify(NotificationType.INFO, "Test 1", "Message")
			service.notify(NotificationType.INFO, "Test 2", "Message")

			expect(service.getPendingCount()).toBe(2)
		})
	})

	describe("notifyActionRequired", () => {
		it("should create persistent notification with actions", () => {
			const handler = vi.fn()
			service.on("notification", handler)

			service.notifyActionRequired("Action Needed", "Please review", [
				{ id: "review", label: "Review", primary: true },
				{ id: "skip", label: "Skip" },
			])

			const notification = handler.mock.calls[0][0]
			expect(notification.type).toBe(NotificationType.ACTION_REQUIRED)
			expect(notification.persistent).toBe(true)
			expect(notification.actions).toHaveLength(2)
		})
	})

	describe("dispose", () => {
		it("should clean up all resources", () => {
			service.notify(NotificationType.INFO, "Test", "Message")
			service.setExtensionIdle(true)
			service.notify(NotificationType.INFO, "Pending", "Message")

			service.dispose()

			expect(service.getNotifications()).toHaveLength(0)
			expect(service.getPendingCount()).toBe(0)
		})
	})
})
