// kilocode_change - new file
import { EventEmitter } from "events"
import { spawn, ChildProcess } from "child_process"
import { logs } from "../logs.js"
import type { TaskConfig, TaskResult, TaskProgress, RetryConfig } from "./types.js"
import { TaskStatus as TaskStatusEnum, TaskPriority } from "./types.js"

/**
 * Represents a single background task that can be executed
 */
export class BackgroundTask extends EventEmitter {
	private config: TaskConfig
	private status: TaskStatusEnum
	private process: ChildProcess | null = null
	private startTime: Date | null = null
	private endTime: Date | null = null
	private output: string[] = []
	private errorOutput: string[] = []
	private retryCount = 0
	private timeoutId: ReturnType<typeof setTimeout> | null = null
	private result: TaskResult | null = null

	constructor(config: TaskConfig) {
		super()
		this.config = {
			...config,
			priority: config.priority ?? TaskPriority.NORMAL,
			timeoutMs: config.timeoutMs ?? 300000, // 5 minutes default
			retryConfig: config.retryConfig ?? {
				maxRetries: 3,
				retryDelayMs: 1000,
				exponentialBackoff: true,
			},
		}
		this.status = TaskStatusEnum.PENDING
	}

	/**
	 * Get the task configuration
	 */
	getConfig(): TaskConfig {
		return { ...this.config }
	}

	/**
	 * Get the task ID
	 */
	getId(): string {
		return this.config.id
	}

	/**
	 * Get the current task status
	 */
	getStatus(): TaskStatusEnum {
		return this.status
	}

	/**
	 * Get the task priority
	 */
	getPriority(): number {
		return this.config.priority
	}

	/**
	 * Get the task result if available
	 */
	getResult(): TaskResult | null {
		return this.result
	}

	/**
	 * Get collected output
	 */
	getOutput(): string[] {
		return [...this.output]
	}

	/**
	 * Get error output
	 */
	getErrorOutput(): string[] {
		return [...this.errorOutput]
	}

	/**
	 * Execute the task
	 */
	async execute(): Promise<TaskResult> {
		if (this.status === TaskStatusEnum.RUNNING) {
			throw new Error(`Task ${this.config.id} is already running`)
		}

		if (this.status === TaskStatusEnum.CANCELLED) {
			throw new Error(`Task ${this.config.id} was cancelled`)
		}

		this.status = TaskStatusEnum.RUNNING
		this.startTime = new Date()
		this.output = []
		this.errorOutput = []

		logs.info(`Starting background task: ${this.config.id}`, "BackgroundTask", {
			type: this.config.type,
			description: this.config.description,
		})

		this.emit("started", this.config)

		try {
			const result = await this.runProcess()
			this.result = result
			return result
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error)

			// Check if we should retry
			if (this.shouldRetry()) {
				return this.retryExecution()
			}

			this.status = TaskStatusEnum.FAILED
			this.endTime = new Date()

			const result: TaskResult = {
				taskId: this.config.id,
				success: false,
				error: errorMessage,
				executionTimeMs: this.getExecutionTime(),
				completedAt: this.endTime,
			}

			this.result = result
			this.emit("failed", result)
			logs.error(`Background task failed: ${this.config.id}`, "BackgroundTask", { error })

			return result
		}
	}

	/**
	 * Run the actual process
	 */
	private async runProcess(): Promise<TaskResult> {
		return new Promise((resolve, reject) => {
			const workingDir = this.config.workingDirectory || process.cwd()

			// Parse the command - for CLI tasks, we use the kilocode CLI
			const args = this.parseCommand()

			logs.debug(`Executing command: kilocode ${args.join(" ")}`, "BackgroundTask", {
				taskId: this.config.id,
				cwd: workingDir,
			})

			// Spawn the process
			this.process = spawn("kilocode", args, {
				cwd: workingDir,
				shell: true,
				stdio: ["pipe", "pipe", "pipe"],
				env: {
					...process.env,
					KILO_BACKGROUND_TASK: "true",
					KILO_TASK_ID: this.config.id,
				},
			})

			// Set up timeout
			if (this.config.timeoutMs) {
				this.timeoutId = setTimeout(() => {
					this.handleTimeout()
				}, this.config.timeoutMs)
			}

			// Collect stdout
			this.process.stdout?.on("data", (data: Buffer) => {
				const text = data.toString()
				this.output.push(text)
				this.emitProgress()
			})

			// Collect stderr
			this.process.stderr?.on("data", (data: Buffer) => {
				const text = data.toString()
				this.errorOutput.push(text)
			})

			// Handle process exit
			this.process.on("exit", (code) => {
				this.clearTimeout()
				this.endTime = new Date()

				if (code === 0) {
					this.status = TaskStatusEnum.COMPLETED
					const result = this.createSuccessResult()
					this.emit("completed", result)
					logs.info(`Background task completed: ${this.config.id}`, "BackgroundTask")
					resolve(result)
				} else {
					const error = new Error(`Process exited with code ${code}`)
					reject(error)
				}
			})

			// Handle process error
			this.process.on("error", (error) => {
				this.clearTimeout()
				reject(error)
			})
		})
	}

	/**
	 * Parse the command string into arguments
	 */
	private parseCommand(): string[] {
		const command = this.config.command.trim()

		// For background research tasks, use CI mode with the prompt
		const args = ["--ci", "--json", `"${command.replace(/"/g, '\\"')}"`]

		if (this.config.workingDirectory) {
			args.unshift("--workspace", this.config.workingDirectory)
		}

		return args
	}

	/**
	 * Emit progress update
	 */
	private emitProgress(): void {
		const currentOp = this.output[this.output.length - 1]?.trim()
		const progress: TaskProgress = {
			taskId: this.config.id,
			percentage: this.estimateProgress(),
			...(currentOp && { currentOperation: currentOp }),
		}
		this.emit("progress", progress)
	}

	/**
	 * Estimate progress based on output length
	 */
	private estimateProgress(): number {
		// Simple heuristic - more output = more progress
		const outputLength = this.output.join("").length
		const maxExpectedLength = 10000 // Adjust based on typical output
		return Math.min(95, Math.floor((outputLength / maxExpectedLength) * 100))
	}

	/**
	 * Create a success result from the collected output
	 */
	private createSuccessResult(): TaskResult {
		const fullOutput = this.output.join("")

		// Try to parse JSON output if available
		let data: unknown = fullOutput
		try {
			// Look for JSON in the output
			const jsonMatch = fullOutput.match(/\{[\s\S]*\}/g)
			if (jsonMatch && jsonMatch.length > 0) {
				const lastMatch = jsonMatch[jsonMatch.length - 1]
				if (lastMatch) {
					data = JSON.parse(lastMatch)
				}
			}
		} catch {
			// Keep as string if parsing fails
		}

		const suggestedFollowUps = this.extractSuggestedFollowUps(data)
		const result: TaskResult = {
			taskId: this.config.id,
			success: true,
			data,
			executionTimeMs: this.getExecutionTime(),
			completedAt: this.endTime || new Date(),
			requiresFollowUp: this.checkIfFollowUpNeeded(data),
			...(suggestedFollowUps && { suggestedFollowUps }),
		}

		return result
	}

	/**
	 * Check if follow-up queries are needed
	 */
	private checkIfFollowUpNeeded(data: unknown): boolean {
		if (typeof data !== "object" || data === null) {
			return false
		}

		const dataObj = data as Record<string, unknown>

		// Check for indicators that more information is needed
		if (dataObj.incomplete || dataObj.partial || dataObj.requiresMoreInfo) {
			return true
		}

		// Check for outdated data
		if (dataObj.lastUpdated && typeof dataObj.lastUpdated === "string") {
			const lastUpdate = new Date(dataObj.lastUpdated)
			const hourAgo = new Date(Date.now() - 60 * 60 * 1000)
			if (lastUpdate < hourAgo) {
				return true
			}
		}

		return false
	}

	/**
	 * Extract suggested follow-up queries from the result
	 */
	private extractSuggestedFollowUps(data: unknown): string[] | undefined {
		if (typeof data !== "object" || data === null) {
			return undefined
		}

		const dataObj = data as Record<string, unknown>

		if (Array.isArray(dataObj.suggestedFollowUps)) {
			return dataObj.suggestedFollowUps.map(String)
		}

		if (Array.isArray(dataObj.relatedQueries)) {
			return dataObj.relatedQueries.map(String)
		}

		return undefined
	}

	/**
	 * Handle task timeout
	 */
	private handleTimeout(): void {
		logs.warn(`Background task timed out: ${this.config.id}`, "BackgroundTask")
		this.kill()
		this.status = TaskStatusEnum.FAILED
		this.endTime = new Date()

		const result: TaskResult = {
			taskId: this.config.id,
			success: false,
			error: `Task timed out after ${this.config.timeoutMs}ms`,
			executionTimeMs: this.getExecutionTime(),
			completedAt: this.endTime,
		}

		this.result = result
		this.emit("timeout", result)
	}

	/**
	 * Check if we should retry the task
	 */
	private shouldRetry(): boolean {
		const retryConfig = this.config.retryConfig as RetryConfig
		return this.retryCount < retryConfig.maxRetries
	}

	/**
	 * Retry the task execution
	 */
	private async retryExecution(): Promise<TaskResult> {
		this.retryCount++
		const retryConfig = this.config.retryConfig as RetryConfig

		// Calculate delay with optional exponential backoff
		let delay = retryConfig.retryDelayMs
		if (retryConfig.exponentialBackoff) {
			delay = delay * Math.pow(2, this.retryCount - 1)
		}

		logs.info(`Retrying background task: ${this.config.id} (attempt ${this.retryCount})`, "BackgroundTask")
		this.emit("retry", { taskId: this.config.id, attempt: this.retryCount, delay })

		// Wait before retry
		await new Promise((resolve) => setTimeout(resolve, delay))

		// Reset state and retry
		this.status = TaskStatusEnum.PENDING
		this.output = []
		this.errorOutput = []

		return this.execute()
	}

	/**
	 * Get execution time in milliseconds
	 */
	private getExecutionTime(): number {
		if (!this.startTime) return 0
		const end = this.endTime || new Date()
		return end.getTime() - this.startTime.getTime()
	}

	/**
	 * Clear the timeout
	 */
	private clearTimeout(): void {
		if (this.timeoutId) {
			clearTimeout(this.timeoutId)
			this.timeoutId = null
		}
	}

	/**
	 * Cancel the task
	 */
	cancel(): void {
		if (this.status === TaskStatusEnum.COMPLETED || this.status === TaskStatusEnum.CANCELLED) {
			return
		}

		logs.info(`Cancelling background task: ${this.config.id}`, "BackgroundTask")
		this.status = TaskStatusEnum.CANCELLED
		this.clearTimeout()
		this.kill()
		this.emit("cancelled", this.config.id)
	}

	/**
	 * Pause the task (if possible)
	 */
	pause(): boolean {
		if (this.status !== TaskStatusEnum.RUNNING || !this.process) {
			return false
		}

		try {
			this.process.kill("SIGSTOP")
			this.status = TaskStatusEnum.PAUSED
			this.emit("paused", this.config.id)
			return true
		} catch {
			return false
		}
	}

	/**
	 * Resume a paused task
	 */
	resume(): boolean {
		if (this.status !== TaskStatusEnum.PAUSED || !this.process) {
			return false
		}

		try {
			this.process.kill("SIGCONT")
			this.status = TaskStatusEnum.RUNNING
			this.emit("resumed", this.config.id)
			return true
		} catch {
			return false
		}
	}

	/**
	 * Kill the process
	 */
	private kill(): void {
		if (this.process && !this.process.killed) {
			try {
				this.process.kill("SIGTERM")
			} catch {
				// Process may already be dead
			}
		}
	}

	/**
	 * Clean up resources
	 */
	dispose(): void {
		this.clearTimeout()
		this.kill()
		this.removeAllListeners()
	}
}
