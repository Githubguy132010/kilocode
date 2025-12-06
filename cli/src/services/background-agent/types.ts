// kilocode_change - new file
import type { EventEmitter } from "events"

/**
 * Priority levels for background tasks
 */
export enum TaskPriority {
	LOW = 1,
	NORMAL = 2,
	HIGH = 3,
	CRITICAL = 4,
}

/**
 * Status of a background task
 */
export enum TaskStatus {
	PENDING = "pending",
	QUEUED = "queued",
	RUNNING = "running",
	COMPLETED = "completed",
	FAILED = "failed",
	CANCELLED = "cancelled",
	PAUSED = "paused",
}

/**
 * Types of background tasks
 */
export enum TaskType {
	RESEARCH = "research",
	FETCH_DATA = "fetch_data",
	ANALYZE = "analyze",
	VALIDATE = "validate",
	FOLLOW_UP = "follow_up",
	CUSTOM = "custom",
}

/**
 * Configuration for task retry behavior
 */
export interface RetryConfig {
	/** Maximum number of retry attempts */
	maxRetries: number
	/** Delay between retries in milliseconds */
	retryDelayMs: number
	/** Whether to use exponential backoff */
	exponentialBackoff: boolean
}

/**
 * Configuration for a background task
 */
export interface TaskConfig {
	/** Unique task identifier */
	id: string
	/** Task type for categorization */
	type: TaskType
	/** Human-readable description */
	description: string
	/** Task priority */
	priority: TaskPriority
	/** The command or prompt to execute */
	command: string
	/** Working directory for the task */
	workingDirectory?: string
	/** Timeout in milliseconds */
	timeoutMs?: number
	/** Retry configuration */
	retryConfig?: RetryConfig
	/** Custom metadata */
	metadata?: Record<string, unknown>
	/** Parent task ID for follow-up tasks */
	parentTaskId?: string
	/** Tags for grouping and filtering */
	tags?: string[]
}

/**
 * Result of a completed task
 */
export interface TaskResult {
	/** Task identifier */
	taskId: string
	/** Whether the task succeeded */
	success: boolean
	/** Task output data */
	data?: unknown
	/** Error message if failed */
	error?: string
	/** Execution time in milliseconds */
	executionTimeMs: number
	/** Whether follow-up queries are recommended */
	requiresFollowUp?: boolean
	/** Suggested follow-up queries */
	suggestedFollowUps?: string[]
	/** Timestamp of completion */
	completedAt: Date
}

/**
 * Progress update for a running task
 */
export interface TaskProgress {
	/** Task identifier */
	taskId: string
	/** Progress percentage (0-100) */
	percentage: number
	/** Current operation description */
	currentOperation?: string
	/** Estimated time remaining in milliseconds */
	estimatedTimeRemainingMs?: number
}

/**
 * Notification types for the user
 */
export enum NotificationType {
	INFO = "info",
	SUCCESS = "success",
	WARNING = "warning",
	ERROR = "error",
	TASK_COMPLETED = "task_completed",
	TASK_FAILED = "task_failed",
	ACTION_REQUIRED = "action_required",
}

/**
 * Notification configuration
 */
export interface Notification {
	/** Unique notification identifier */
	id: string
	/** Notification type */
	type: NotificationType
	/** Short title */
	title: string
	/** Detailed message */
	message: string
	/** Related task ID if applicable */
	taskId?: string
	/** Whether to persist until dismissed */
	persistent?: boolean
	/** Suggested actions */
	actions?: NotificationAction[]
	/** When the notification was created */
	createdAt: Date
}

/**
 * Action that can be taken from a notification
 */
export interface NotificationAction {
	/** Action identifier */
	id: string
	/** Action label */
	label: string
	/** Whether this is the primary action */
	primary?: boolean
}

/**
 * Resource usage metrics
 */
export interface ResourceMetrics {
	/** CPU usage percentage */
	cpuUsage: number
	/** Memory usage in bytes */
	memoryUsage: number
	/** Number of active processes */
	activeProcesses: number
	/** Timestamp of measurement */
	timestamp: Date
}

/**
 * Resource limits configuration
 */
export interface ResourceLimits {
	/** Maximum CPU usage percentage */
	maxCpuPercent: number
	/** Maximum memory usage in bytes */
	maxMemoryBytes: number
	/** Maximum concurrent tasks */
	maxConcurrentTasks: number
	/** Maximum queue size */
	maxQueueSize: number
}

/**
 * Configuration for the background agent manager
 */
export interface BackgroundAgentConfig {
	/** Resource limits */
	resourceLimits: ResourceLimits
	/** Default task timeout in milliseconds */
	defaultTimeoutMs: number
	/** Default retry configuration */
	defaultRetryConfig: RetryConfig
	/** Whether to enable persistent processes */
	enablePersistence: boolean
	/** Notification preferences */
	notificationPreferences: NotificationPreferences
	/** Polling interval for resource monitoring in milliseconds */
	resourceMonitorIntervalMs: number
}

/**
 * Notification preferences
 */
export interface NotificationPreferences {
	/** Show notifications when tasks complete */
	showOnComplete: boolean
	/** Show notifications when tasks fail */
	showOnError: boolean
	/** Show progress notifications */
	showProgress: boolean
	/** Minimum priority to show notifications for */
	minPriorityForNotification: TaskPriority
}

/**
 * Satisfaction criteria for follow-up task logic
 */
export interface SatisfactionCriteria {
	/** Required fields that must be present */
	requiredFields?: string[]
	/** Minimum data freshness (age in milliseconds) */
	maxDataAgeMs?: number
	/** Custom validation function */
	validator?: (result: TaskResult) => boolean
	/** Maximum follow-up attempts */
	maxFollowUpAttempts?: number
}

/**
 * Events emitted by the background agent system
 */
export interface BackgroundAgentEvents {
	taskQueued: (task: TaskConfig) => void
	taskStarted: (task: TaskConfig) => void
	taskProgress: (progress: TaskProgress) => void
	taskCompleted: (result: TaskResult) => void
	taskFailed: (taskId: string, error: Error) => void
	taskCancelled: (taskId: string) => void
	notification: (notification: Notification) => void
	resourceWarning: (metrics: ResourceMetrics) => void
	extensionIdle: () => void
	extensionActive: () => void
}

/**
 * Interface for the background agent manager
 */
export interface IBackgroundAgentManager extends EventEmitter {
	/** Queue a new task */
	queueTask(config: TaskConfig): Promise<string>

	/** Cancel a task by ID */
	cancelTask(taskId: string): Promise<boolean>

	/** Get task status */
	getTaskStatus(taskId: string): TaskStatus | null

	/** Get all running tasks */
	getRunningTasks(): TaskConfig[]

	/** Get all queued tasks */
	getQueuedTasks(): TaskConfig[]

	/** Get task result */
	getTaskResult(taskId: string): TaskResult | null

	/** Set satisfaction criteria for a task type */
	setSatisfactionCriteria(taskType: TaskType, criteria: SatisfactionCriteria): void

	/** Pause all task execution */
	pause(): void

	/** Resume task execution */
	resume(): void

	/** Check if the manager is running */
	isRunning(): boolean

	/** Get current resource metrics */
	getResourceMetrics(): ResourceMetrics

	/** Update configuration */
	updateConfig(config: Partial<BackgroundAgentConfig>): void

	/** Dispose and clean up */
	dispose(): Promise<void>
}
