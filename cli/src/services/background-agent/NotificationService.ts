// kilocode_change - new file
import { EventEmitter } from "events"
import { logs } from "../logs.js"
import type {
	Notification,
	NotificationAction,
	NotificationType,
	NotificationPreferences,
	TaskResult,
	TaskPriority,
} from "./types.js"
import { NotificationType as NotificationTypeEnum } from "./types.js"

/**
 * Service for managing notifications to the user
 * Handles task completion notifications, warnings, and action prompts
 */
export class NotificationService extends EventEmitter {
	private notifications: Notification[] = []
	private preferences: NotificationPreferences
	private extensionIdleState = false
	private pendingNotifications: Notification[] = []
	private maxStoredNotifications = 100

	constructor(preferences: NotificationPreferences) {
		super()
		this.preferences = preferences
	}

	/**
	 * Update notification preferences
	 */
	updatePreferences(preferences: Partial<NotificationPreferences>): void {
		this.preferences = {
			...this.preferences,
			...preferences,
		}
		logs.debug("Notification preferences updated", "NotificationService")
	}

	/**
	 * Get current preferences
	 */
	getPreferences(): NotificationPreferences {
		return { ...this.preferences }
	}

	/**
	 * Set extension idle state
	 * When idle, notifications are queued for delivery when appropriate
	 */
	setExtensionIdle(idle: boolean): void {
		const wasIdle = this.extensionIdleState
		this.extensionIdleState = idle

		if (wasIdle && !idle) {
			// Extension became active, deliver pending notifications
			this.deliverPendingNotifications()
		}

		logs.debug(`Extension idle state: ${idle}`, "NotificationService")
	}

	/**
	 * Check if extension is idle
	 */
	isExtensionIdle(): boolean {
		return this.extensionIdleState
	}

	/**
	 * Create and send a notification for a completed task
	 */
	notifyTaskCompleted(result: TaskResult, taskPriority: TaskPriority): void {
		if (!this.preferences.showOnComplete) {
			return
		}

		if (taskPriority < this.preferences.minPriorityForNotification) {
			return
		}

		const notification: Notification = {
			id: `task-complete-${result.taskId}`,
			type: NotificationTypeEnum.TASK_COMPLETED,
			title: "Background Task Completed",
			message: result.success
				? `Task completed successfully in ${this.formatDuration(result.executionTimeMs)}`
				: `Task failed: ${result.error}`,
			taskId: result.taskId,
			persistent: false,
			createdAt: new Date(),
			actions: this.getCompletionActions(result),
		}

		this.sendNotification(notification)
	}

	/**
	 * Create and send a notification for a failed task
	 */
	notifyTaskFailed(taskId: string, error: string, taskPriority: TaskPriority): void {
		if (!this.preferences.showOnError) {
			return
		}

		if (taskPriority < this.preferences.minPriorityForNotification) {
			return
		}

		const notification: Notification = {
			id: `task-failed-${taskId}`,
			type: NotificationTypeEnum.TASK_FAILED,
			title: "Background Task Failed",
			message: `Task failed: ${error}`,
			taskId,
			persistent: true,
			createdAt: new Date(),
			actions: [
				{ id: "retry", label: "Retry", primary: true },
				{ id: "dismiss", label: "Dismiss" },
			],
		}

		this.sendNotification(notification)
	}

	/**
	 * Create and send a general notification
	 */
	notify(
		type: NotificationType,
		title: string,
		message: string,
		options?: {
			taskId?: string
			persistent?: boolean
			actions?: NotificationAction[]
		},
	): void {
		const notification: Notification = {
			id: `${type}-${Date.now()}`,
			type,
			title,
			message,
			persistent: options?.persistent ?? false,
			createdAt: new Date(),
			...(options?.taskId && { taskId: options.taskId }),
			...(options?.actions && { actions: options.actions }),
		}

		this.sendNotification(notification)
	}

	/**
	 * Send a notification
	 */
	private sendNotification(notification: Notification): void {
		// Store the notification
		this.storeNotification(notification)

		// If extension is idle, queue for later delivery
		if (this.extensionIdleState) {
			this.pendingNotifications.push(notification)
			logs.debug(`Notification queued (extension idle): ${notification.title}`, "NotificationService")
			return
		}

		// Emit the notification
		this.emit("notification", notification)
		logs.info(`Notification sent: ${notification.title}`, "NotificationService", {
			type: notification.type,
			taskId: notification.taskId,
		})
	}

	/**
	 * Store notification in history
	 */
	private storeNotification(notification: Notification): void {
		this.notifications.push(notification)

		// Limit stored notifications
		if (this.notifications.length > this.maxStoredNotifications) {
			this.notifications = this.notifications.slice(-this.maxStoredNotifications)
		}
	}

	/**
	 * Deliver pending notifications when extension becomes active
	 */
	private deliverPendingNotifications(): void {
		if (this.pendingNotifications.length === 0) {
			return
		}

		logs.info(`Delivering ${this.pendingNotifications.length} pending notifications`, "NotificationService")

		// Group similar notifications to avoid spam
		const grouped = this.groupNotifications(this.pendingNotifications)

		for (const notification of grouped) {
			this.emit("notification", notification)
		}

		this.pendingNotifications = []
	}

	/**
	 * Group similar notifications
	 */
	private groupNotifications(notifications: Notification[]): Notification[] {
		// Group by type
		const byType = new Map<NotificationType, Notification[]>()

		for (const n of notifications) {
			const existing = byType.get(n.type) || []
			existing.push(n)
			byType.set(n.type, existing)
		}

		const grouped: Notification[] = []

		for (const [type, items] of byType) {
			if (items.length === 1 && items[0]) {
				grouped.push(items[0])
			} else {
				// Create a summary notification
				grouped.push({
					id: `grouped-${type}-${Date.now()}`,
					type,
					title: this.getGroupedTitle(type, items.length),
					message: this.getGroupedMessage(items),
					persistent: items.some((i) => i.persistent),
					createdAt: new Date(),
					actions: [{ id: "view-all", label: "View All", primary: true }],
				})
			}
		}

		return grouped
	}

	/**
	 * Get a title for grouped notifications
	 */
	private getGroupedTitle(type: NotificationType, count: number): string {
		switch (type) {
			case NotificationTypeEnum.TASK_COMPLETED:
				return `${count} Background Tasks Completed`
			case NotificationTypeEnum.TASK_FAILED:
				return `${count} Background Tasks Failed`
			default:
				return `${count} Notifications`
		}
	}

	/**
	 * Get a message for grouped notifications
	 */
	private getGroupedMessage(notifications: Notification[]): string {
		const taskIds = notifications
			.filter((n) => n.taskId)
			.map((n) => n.taskId)
			.slice(0, 5)

		if (taskIds.length > 0) {
			const suffix =
				taskIds.length < notifications.length ? ` and ${notifications.length - taskIds.length} more` : ""
			return `Tasks: ${taskIds.join(", ")}${suffix}`
		}

		return `${notifications.length} notifications pending review`
	}

	/**
	 * Get actions for a completed task notification
	 */
	private getCompletionActions(result: TaskResult): NotificationAction[] {
		const actions: NotificationAction[] = [{ id: "dismiss", label: "Dismiss" }]

		if (result.success) {
			actions.unshift({ id: "view-result", label: "View Result", primary: true })

			if (result.requiresFollowUp) {
				actions.push({ id: "run-followup", label: "Run Follow-up" })
			}
		} else {
			actions.unshift({ id: "retry", label: "Retry", primary: true })
		}

		return actions
	}

	/**
	 * Handle an action from a notification
	 */
	handleAction(notificationId: string, actionId: string): void {
		const notification = this.notifications.find((n) => n.id === notificationId)
		if (!notification) {
			logs.warn(`Notification not found: ${notificationId}`, "NotificationService")
			return
		}

		logs.debug(`Notification action: ${actionId} on ${notificationId}`, "NotificationService")
		this.emit("action", { notificationId, actionId, notification })

		// Auto-dismiss non-persistent notifications
		if (!notification.persistent || actionId === "dismiss") {
			this.dismiss(notificationId)
		}
	}

	/**
	 * Dismiss a notification
	 */
	dismiss(notificationId: string): void {
		const index = this.notifications.findIndex((n) => n.id === notificationId)
		if (index !== -1) {
			this.notifications.splice(index, 1)
			this.emit("dismissed", notificationId)
		}

		// Also remove from pending
		const pendingIndex = this.pendingNotifications.findIndex((n) => n.id === notificationId)
		if (pendingIndex !== -1) {
			this.pendingNotifications.splice(pendingIndex, 1)
		}
	}

	/**
	 * Dismiss all notifications
	 */
	dismissAll(): void {
		const ids = this.notifications.map((n) => n.id)
		this.notifications = []
		this.pendingNotifications = []

		for (const id of ids) {
			this.emit("dismissed", id)
		}
	}

	/**
	 * Get all active notifications
	 */
	getNotifications(): Notification[] {
		return [...this.notifications]
	}

	/**
	 * Get pending notifications count
	 */
	getPendingCount(): number {
		return this.pendingNotifications.length
	}

	/**
	 * Format duration for display
	 */
	private formatDuration(ms: number): string {
		if (ms < 1000) {
			return `${ms}ms`
		}
		if (ms < 60000) {
			return `${Math.round(ms / 1000)}s`
		}
		const minutes = Math.floor(ms / 60000)
		const seconds = Math.round((ms % 60000) / 1000)
		return `${minutes}m ${seconds}s`
	}

	/**
	 * Create a notification for action required
	 */
	notifyActionRequired(title: string, message: string, actions: NotificationAction[], taskId?: string): void {
		const notification: Notification = {
			id: `action-required-${Date.now()}`,
			type: NotificationTypeEnum.ACTION_REQUIRED,
			title,
			message,
			persistent: true,
			actions,
			createdAt: new Date(),
			...(taskId && { taskId }),
		}

		this.sendNotification(notification)
	}

	/**
	 * Dispose and clean up
	 */
	dispose(): void {
		this.notifications = []
		this.pendingNotifications = []
		this.removeAllListeners()
		logs.debug("Notification service disposed", "NotificationService")
	}
}
