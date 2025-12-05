// kilocode_change - new file
/**
 * Background Agent System
 *
 * This module provides an asynchronous background agent system for the Kilo Code CLI
 * that enables real-time collaboration between extension-driven planning and
 * CLI-executed research tasks.
 *
 * Features:
 * - Persistent CLI processes that run even when extension is idle
 * - Task prioritization and conflict resolution
 * - Resource monitoring to avoid overloading the host machine
 * - Non-intrusive notifications for idle state updates
 * - Automatic follow-up query dispatch for refining information
 * - Support for multiple independent CLI instances in parallel
 *
 * @example
 * ```typescript
 * import { getBackgroundAgentManager, TaskType, TaskPriority } from './services/background-agent'
 *
 * const manager = getBackgroundAgentManager()
 * await manager.initialize(extensionService)
 *
 * // Queue a research task
 * const taskId = await manager.queueResearchTask(
 *   'Fetch the latest stable Next.js version and its breaking changes',
 *   { priority: TaskPriority.HIGH }
 * )
 *
 * // Listen for completion
 * manager.on('taskCompleted', (result) => {
 *   console.log('Task completed:', result)
 * })
 * ```
 */

// Export types
export { TaskPriority, TaskStatus, TaskType, NotificationType } from "./types.js"

export type {
	TaskConfig,
	TaskResult,
	TaskProgress,
	RetryConfig,
	Notification,
	NotificationAction,
	NotificationPreferences,
	ResourceMetrics,
	ResourceLimits,
	BackgroundAgentConfig,
	SatisfactionCriteria,
	IBackgroundAgentManager,
	BackgroundAgentEvents,
} from "./types.js"

// Export classes
export { BackgroundTask } from "./BackgroundTask.js"
export { TaskQueue } from "./TaskQueue.js"
export { ResourceMonitor } from "./ResourceMonitor.js"
export { NotificationService } from "./NotificationService.js"
export {
	BackgroundAgentManager,
	getBackgroundAgentManager,
	resetBackgroundAgentManager,
} from "./BackgroundAgentManager.js"
