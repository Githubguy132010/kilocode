/**
 * Settings passed to system prompt generation functions
 */
export interface SystemPromptSettings {
	maxConcurrentFileReads: number
	alwaysUseSimpleReadFile?: boolean // kilocode_change
	todoListEnabled: boolean
	useAgentRules: boolean
	newTaskRequireTodos: boolean
}
