// kilocode_change - new file
import { EventEmitter } from "events"
import { randomUUID } from "crypto"
import { logs } from "../logs.js"
import { BackgroundTask } from "./BackgroundTask.js"
import { TaskQueue } from "./TaskQueue.js"
import { ResourceMonitor } from "./ResourceMonitor.js"
import { NotificationService } from "./NotificationService.js"
import type {
	TaskConfig,
	TaskStatus,
	TaskResult,
	TaskProgress,
	TaskType,
	ResourceMetrics,
	BackgroundAgentConfig,
	SatisfactionCriteria,
	IBackgroundAgentManager,
	Notification,
} from "./types.js"
import { TaskType as TaskTypeEnum, TaskPriority, NotificationType } from "./types.js"
import type { ExtensionService } from "../extension.js"

/**
 * Default configuration for the background agent
 */
const DEFAULT_CONFIG: BackgroundAgentConfig = {
	resourceLimits: {
		maxCpuPercent: 80,
		maxMemoryBytes: 4 * 1024 * 1024 * 1024, // 4GB
		maxConcurrentTasks: 3,
		maxQueueSize: 50,
	},
	defaultTimeoutMs: 300000, // 5 minutes
	defaultRetryConfig: {
		maxRetries: 3,
		retryDelayMs: 1000,
		exponentialBackoff: true,
	},
	enablePersistence: true,
	notificationPreferences: {
		showOnComplete: true,
		showOnError: true,
		showProgress: false,
		minPriorityForNotification: TaskPriority.NORMAL,
	},
	resourceMonitorIntervalMs: 5000,
}

/**
 * Main manager for background agent tasks
 * Coordinates task execution, resource monitoring, and notifications
 */
export class BackgroundAgentManager extends EventEmitter implements IBackgroundAgentManager {
	private config: BackgroundAgentConfig
	private taskQueue: TaskQueue
	private resourceMonitor: ResourceMonitor
	private notificationService: NotificationService
	private extensionService: ExtensionService | null = null
	private satisfactionCriteria: Map<TaskType, SatisfactionCriteria> = new Map()
	private followUpCounts: Map<string, number> = new Map()
	private _isRunning = false
	private extensionIdleCheckInterval: ReturnType<typeof setInterval> | null = null
	private lastExtensionActivity: Date = new Date()
	private extensionIdleThresholdMs = 30000 // 30 seconds

	constructor(config: Partial<BackgroundAgentConfig> = {}) {
		super()
		this.config = {
			...DEFAULT_CONFIG,
			...config,
			resourceLimits: {
				...DEFAULT_CONFIG.resourceLimits,
				...config.resourceLimits,
			},
			notificationPreferences: {
				...DEFAULT_CONFIG.notificationPreferences,
				...config.notificationPreferences,
			},
		}

		// Initialize components
		this.taskQueue = new TaskQueue(this.config.resourceLimits.maxConcurrentTasks)
		this.resourceMonitor = new ResourceMonitor(this.config.resourceLimits)
		this.notificationService = new NotificationService(this.config.notificationPreferences)

		this.setupEventListeners()
	}

	/**
	 * Set up event listeners for internal components
	 */
	private setupEventListeners(): void {
		// Task queue events
		this.taskQueue.on("taskQueued", (config: TaskConfig) => {
			this.emit("taskQueued", config)
		})

		this.taskQueue.on("taskStarted", (config: TaskConfig) => {
			this.emit("taskStarted", config)
		})

		this.taskQueue.on("taskProgress", (progress: TaskProgress) => {
			this.emit("taskProgress", progress)
		})

		this.taskQueue.on("taskCompleted", (result: TaskResult) => {
			this.handleTaskCompletion(result)
		})

		this.taskQueue.on("taskCancelled", (taskId: string) => {
			this.emit("taskCancelled", taskId)
		})

		// Resource monitor events
		this.resourceMonitor.on("warning", (data: { warnings: string[]; metrics: ResourceMetrics }) => {
			this.emit("resourceWarning", data.metrics)
			this.handleResourceWarning(data.warnings)
		})

		// Notification service events
		this.notificationService.on("notification", (notification: Notification) => {
			this.emit("notification", notification)
		})

		this.notificationService.on("action", (data: { notificationId: string; actionId: string }) => {
			this.handleNotificationAction(data.notificationId, data.actionId)
		})
	}

	/**
	 * Initialize the background agent manager
	 */
	async initialize(extensionService?: ExtensionService): Promise<void> {
		if (this._isRunning) {
			logs.warn("Background agent manager already running", "BackgroundAgentManager")
			return
		}

		logs.info("Initializing background agent manager", "BackgroundAgentManager")

		// Store extension service reference
		if (extensionService) {
			this.extensionService = extensionService
			this.setupExtensionListeners()
		}

		// Start resource monitoring
		this.resourceMonitor.start(this.config.resourceMonitorIntervalMs)

		// Start extension idle checking
		this.startIdleChecking()

		this._isRunning = true
		logs.info("Background agent manager initialized", "BackgroundAgentManager")
	}

	/**
	 * Set up listeners for extension events
	 */
	private setupExtensionListeners(): void {
		if (!this.extensionService) return

		// Track extension activity
		this.extensionService.on("message", () => {
			this.updateExtensionActivity()
		})

		this.extensionService.on("stateChange", () => {
			this.updateExtensionActivity()
		})
	}

	/**
	 * Update last extension activity timestamp
	 */
	private updateExtensionActivity(): void {
		const wasIdle = this.isExtensionIdle()
		this.lastExtensionActivity = new Date()

		if (wasIdle) {
			logs.debug("Extension became active", "BackgroundAgentManager")
			this.notificationService.setExtensionIdle(false)
			this.emit("extensionActive")
		}
	}

	/**
	 * Check if extension is currently idle
	 */
	private isExtensionIdle(): boolean {
		const now = new Date()
		return now.getTime() - this.lastExtensionActivity.getTime() > this.extensionIdleThresholdMs
	}

	/**
	 * Start idle checking interval
	 */
	private startIdleChecking(): void {
		this.extensionIdleCheckInterval = setInterval(() => {
			if (this.isExtensionIdle() && !this.notificationService.isExtensionIdle()) {
				logs.debug("Extension became idle", "BackgroundAgentManager")
				this.notificationService.setExtensionIdle(true)
				this.emit("extensionIdle")
			}
		}, 5000)
	}

	/**
	 * Stop idle checking interval
	 */
	private stopIdleChecking(): void {
		if (this.extensionIdleCheckInterval) {
			clearInterval(this.extensionIdleCheckInterval)
			this.extensionIdleCheckInterval = null
		}
	}

	/**
	 * Queue a new background task
	 */
	async queueTask(config: TaskConfig): Promise<string> {
		// Generate ID if not provided
		const taskId = config.id || randomUUID()
		const taskConfig: TaskConfig = {
			...config,
			id: taskId,
			timeoutMs: config.timeoutMs ?? this.config.defaultTimeoutMs,
			retryConfig: config.retryConfig ?? this.config.defaultRetryConfig,
		}

		// Check queue size limit
		const stats = this.taskQueue.getStats()
		if (stats.queuedCount >= this.config.resourceLimits.maxQueueSize) {
			throw new Error(`Queue is full (max ${this.config.resourceLimits.maxQueueSize} tasks)`)
		}

		// Check resource availability
		const resourceCheck = this.resourceMonitor.canAcceptNewTask(stats.runningCount)
		if (!resourceCheck.allowed) {
			logs.warn(`Resource check failed: ${resourceCheck.reason}`, "BackgroundAgentManager")
			// Queue anyway but log warning
		}

		// Create and queue the task
		const task = new BackgroundTask(taskConfig)
		this.taskQueue.enqueue(task)

		logs.info(`Task queued: ${taskId}`, "BackgroundAgentManager", {
			type: taskConfig.type,
			priority: taskConfig.priority,
		})

		return taskId
	}

	/**
	 * Cancel a task by ID
	 */
	async cancelTask(taskId: string): Promise<boolean> {
		const result = this.taskQueue.cancelTask(taskId)
		if (result) {
			logs.info(`Task cancelled: ${taskId}`, "BackgroundAgentManager")
		}
		return result
	}

	/**
	 * Get task status
	 */
	getTaskStatus(taskId: string): TaskStatus | null {
		return this.taskQueue.getTaskStatus(taskId)
	}

	/**
	 * Get all running tasks
	 */
	getRunningTasks(): TaskConfig[] {
		return this.taskQueue.getRunningTasks()
	}

	/**
	 * Get all queued tasks
	 */
	getQueuedTasks(): TaskConfig[] {
		return this.taskQueue.getQueuedTasks()
	}

	/**
	 * Get task result
	 */
	getTaskResult(taskId: string): TaskResult | null {
		return this.taskQueue.getTaskResult(taskId)
	}

	/**
	 * Set satisfaction criteria for a task type
	 */
	setSatisfactionCriteria(taskType: TaskType, criteria: SatisfactionCriteria): void {
		this.satisfactionCriteria.set(taskType, criteria)
		logs.debug(`Satisfaction criteria set for ${taskType}`, "BackgroundAgentManager")
	}

	/**
	 * Handle task completion
	 */
	private handleTaskCompletion(result: TaskResult): void {
		const taskConfig = this.findTaskConfig(result.taskId)
		const priority = taskConfig?.priority ?? TaskPriority.NORMAL

		// Emit completion event
		this.emit("taskCompleted", result)

		// Send notification
		if (result.success) {
			this.notificationService.notifyTaskCompleted(result, priority)
		} else {
			this.notificationService.notifyTaskFailed(result.taskId, result.error || "Unknown error", priority)
			this.emit("taskFailed", result.taskId, new Error(result.error || "Unknown error"))
		}

		// Check if follow-up is needed
		if (result.success && result.requiresFollowUp) {
			this.handleFollowUp(result, taskConfig)
		}
	}

	/**
	 * Find task config by ID
	 */
	private findTaskConfig(taskId: string): TaskConfig | null {
		const running = this.getRunningTasks().find((t) => t.id === taskId)
		if (running) return running

		const queued = this.getQueuedTasks().find((t) => t.id === taskId)
		if (queued) return queued

		return null
	}

	/**
	 * Handle follow-up task creation
	 */
	private handleFollowUp(result: TaskResult, originalConfig: TaskConfig | null): void {
		if (!originalConfig) return

		// Check satisfaction criteria
		const criteria = this.satisfactionCriteria.get(originalConfig.type)
		if (criteria && this.checkSatisfactionMet(result, criteria)) {
			logs.debug(`Satisfaction criteria met for ${result.taskId}`, "BackgroundAgentManager")
			return
		}

		// Check follow-up count limit
		const followUpKey = originalConfig.parentTaskId || result.taskId
		const currentCount = this.followUpCounts.get(followUpKey) || 0
		const maxFollowUps = criteria?.maxFollowUpAttempts ?? 3

		if (currentCount >= maxFollowUps) {
			logs.warn(`Max follow-up attempts reached for ${followUpKey}`, "BackgroundAgentManager")
			this.notificationService.notifyActionRequired(
				"Follow-up Limit Reached",
				`Task ${result.taskId} needs more information but follow-up limit (${maxFollowUps}) reached`,
				[
					{ id: "manual-followup", label: "Continue Manually", primary: true },
					{ id: "dismiss", label: "Dismiss" },
				],
				result.taskId,
			)
			return
		}

		// Queue follow-up tasks
		if (result.suggestedFollowUps && result.suggestedFollowUps.length > 0) {
			this.followUpCounts.set(followUpKey, currentCount + 1)

			for (const followUp of result.suggestedFollowUps.slice(0, 3)) {
				// Limit to 3 follow-ups
				const taskConfig: TaskConfig = {
					id: randomUUID(),
					type: TaskTypeEnum.FOLLOW_UP,
					description: `Follow-up for ${result.taskId}`,
					priority: originalConfig.priority,
					command: followUp,
					parentTaskId: followUpKey,
					tags: [...(originalConfig.tags || []), "follow-up"],
				}
				if (originalConfig.workingDirectory) {
					taskConfig.workingDirectory = originalConfig.workingDirectory
				}
				void this.queueTask(taskConfig)
			}

			logs.info(
				`Queued ${result.suggestedFollowUps.length} follow-up tasks for ${result.taskId}`,
				"BackgroundAgentManager",
			)
		}
	}

	/**
	 * Check if satisfaction criteria are met
	 */
	private checkSatisfactionMet(result: TaskResult, criteria: SatisfactionCriteria): boolean {
		if (!result.success) return false

		// Check custom validator
		if (criteria.validator && !criteria.validator(result)) {
			return false
		}

		// Check required fields
		if (criteria.requiredFields && typeof result.data === "object" && result.data !== null) {
			const data = result.data as Record<string, unknown>
			for (const field of criteria.requiredFields) {
				if (!(field in data) || data[field] === undefined || data[field] === null) {
					return false
				}
			}
		}

		// Check data freshness
		if (criteria.maxDataAgeMs && typeof result.data === "object" && result.data !== null) {
			const data = result.data as Record<string, unknown>
			if (data.lastUpdated && typeof data.lastUpdated === "string") {
				try {
					const lastUpdate = new Date(data.lastUpdated)
					// Check for invalid date
					if (!isNaN(lastUpdate.getTime())) {
						const age = Date.now() - lastUpdate.getTime()
						if (age > criteria.maxDataAgeMs) {
							return false
						}
					}
				} catch {
					// Invalid date format, skip freshness check
					logs.debug("Could not parse lastUpdated date for freshness check", "BackgroundAgentManager")
				}
			}
		}

		return true
	}

	/**
	 * Handle resource warning
	 */
	private handleResourceWarning(warnings: string[]): void {
		// Reduce concurrency if resources are strained
		const currentStats = this.taskQueue.getStats()
		if (currentStats.runningCount > 1) {
			this.taskQueue.setMaxConcurrent(Math.max(1, currentStats.runningCount - 1))
			logs.warn("Reduced task concurrency due to resource constraints", "BackgroundAgentManager")
		}

		// Notify user
		this.notificationService.notify(
			NotificationType.WARNING,
			"Resource Warning",
			`System resources are constrained: ${warnings.join("; ")}`,
		)
	}

	/**
	 * Handle notification action
	 */
	private handleNotificationAction(notificationId: string, actionId: string): void {
		logs.debug(`Notification action: ${actionId}`, "BackgroundAgentManager")

		switch (actionId) {
			case "retry": {
				// Extract task ID from notification ID
				const match = notificationId.match(/task-(?:complete|failed)-(.+)/)
				if (match && match[1]) {
					const taskId = match[1]
					const config = this.findTaskConfig(taskId)
					if (config) {
						const retryConfig: TaskConfig = {
							...config,
							id: randomUUID(),
							parentTaskId: taskId,
						}
						void this.queueTask(retryConfig)
					}
				}
				break
			}

			case "run-followup": {
				const match = notificationId.match(/task-complete-(.+)/)
				if (match && match[1]) {
					const taskId = match[1]
					const result = this.getTaskResult(taskId)
					if (result) {
						this.handleFollowUp(result, this.findTaskConfig(taskId))
					}
				}
				break
			}

			case "view-result":
			case "view-all":
			case "manual-followup":
				// These actions are handled by the UI layer
				break

			case "dismiss":
				// Already handled by notification service
				break
		}
	}

	/**
	 * Pause all task execution
	 */
	pause(): void {
		this.taskQueue.pause()
		this.taskQueue.pauseAllTasks()
		logs.info("Background agent paused", "BackgroundAgentManager")
	}

	/**
	 * Resume task execution
	 */
	resume(): void {
		this.taskQueue.resume()
		this.taskQueue.resumeAllTasks()
		logs.info("Background agent resumed", "BackgroundAgentManager")
	}

	/**
	 * Check if the manager is running
	 */
	isRunning(): boolean {
		return this._isRunning
	}

	/**
	 * Check if the manager is running (alias for isRunning)
	 */
	isRunningState(): boolean {
		return this._isRunning
	}

	/**
	 * Get current resource metrics
	 */
	getResourceMetrics(): ResourceMetrics {
		return (
			this.resourceMonitor.getMetrics() ?? {
				cpuUsage: 0,
				memoryUsage: 0,
				activeProcesses: 0,
				timestamp: new Date(),
			}
		)
	}

	/**
	 * Update configuration
	 */
	updateConfig(config: Partial<BackgroundAgentConfig>): void {
		if (config.resourceLimits) {
			this.config.resourceLimits = {
				...this.config.resourceLimits,
				...config.resourceLimits,
			}
			this.resourceMonitor.updateLimits(this.config.resourceLimits)
			this.taskQueue.setMaxConcurrent(this.config.resourceLimits.maxConcurrentTasks)
		}

		if (config.notificationPreferences) {
			this.config.notificationPreferences = {
				...this.config.notificationPreferences,
				...config.notificationPreferences,
			}
			this.notificationService.updatePreferences(this.config.notificationPreferences)
		}

		if (config.defaultTimeoutMs !== undefined) {
			this.config.defaultTimeoutMs = config.defaultTimeoutMs
		}

		if (config.defaultRetryConfig) {
			this.config.defaultRetryConfig = {
				...this.config.defaultRetryConfig,
				...config.defaultRetryConfig,
			}
		}

		logs.debug("Configuration updated", "BackgroundAgentManager")
	}

	/**
	 * Get queue statistics
	 */
	getStats(): {
		queuedCount: number
		runningCount: number
		completedCount: number
		maxConcurrent: number
		isRunning: boolean
		isPaused: boolean
	} {
		const queueStats = this.taskQueue.getStats()
		return {
			...queueStats,
			isRunning: this._isRunning,
			isPaused: this.taskQueue.isPausedState(),
		}
	}

	/**
	 * Queue a research task (convenience method)
	 */
	async queueResearchTask(prompt: string, options?: Partial<TaskConfig>): Promise<string> {
		const baseConfig: TaskConfig = {
			id: options?.id ?? randomUUID(),
			type: TaskTypeEnum.RESEARCH,
			description: options?.description ?? `Research: ${prompt.slice(0, 50)}...`,
			priority: options?.priority ?? TaskPriority.NORMAL,
			command: prompt,
		}
		if (options?.workingDirectory) {
			baseConfig.workingDirectory = options.workingDirectory
		}
		return this.queueTask({
			...baseConfig,
			...options,
		})
	}

	/**
	 * Queue a data fetch task (convenience method)
	 */
	async queueFetchTask(url: string, options?: Partial<TaskConfig>): Promise<string> {
		const baseConfig: TaskConfig = {
			id: options?.id ?? randomUUID(),
			type: TaskTypeEnum.FETCH_DATA,
			description: options?.description ?? `Fetch: ${url.slice(0, 50)}...`,
			priority: options?.priority ?? TaskPriority.NORMAL,
			command: `Fetch and analyze data from: ${url}`,
		}
		return this.queueTask({
			...baseConfig,
			...options,
		})
	}

	/**
	 * Queue an analysis task (convenience method)
	 */
	async queueAnalysisTask(query: string, options?: Partial<TaskConfig>): Promise<string> {
		const baseConfig: TaskConfig = {
			id: options?.id ?? randomUUID(),
			type: TaskTypeEnum.ANALYZE,
			description: options?.description ?? `Analyze: ${query.slice(0, 50)}...`,
			priority: options?.priority ?? TaskPriority.HIGH,
			command: query,
		}
		return this.queueTask({
			...baseConfig,
			...options,
		})
	}

	/**
	 * Dispose and clean up
	 */
	async dispose(): Promise<void> {
		if (!this._isRunning) {
			return
		}

		logs.info("Disposing background agent manager", "BackgroundAgentManager")

		this.stopIdleChecking()
		this.taskQueue.dispose()
		this.resourceMonitor.dispose()
		this.notificationService.dispose()

		this.satisfactionCriteria.clear()
		this.followUpCounts.clear()
		this.extensionService = null
		this._isRunning = false

		this.removeAllListeners()
		logs.info("Background agent manager disposed", "BackgroundAgentManager")
	}
}

/**
 * Singleton instance
 */
let instance: BackgroundAgentManager | null = null

/**
 * Get or create the background agent manager instance
 */
export function getBackgroundAgentManager(config?: Partial<BackgroundAgentConfig>): BackgroundAgentManager {
	if (!instance) {
		instance = new BackgroundAgentManager(config)
	}
	return instance
}

/**
 * Reset the singleton instance (for testing)
 */
export function resetBackgroundAgentManager(): void {
	if (instance) {
		void instance.dispose()
		instance = null
	}
}
