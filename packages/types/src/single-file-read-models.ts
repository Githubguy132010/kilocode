/**
 * Configuration for models that should use simplified single-file read_file tool
 * These models will use the simpler <read_file><path>...</path></read_file> format
 * instead of the more complex multi-file args format
 */

/**
 * Check if a model should use single file read format
 * @param modelId The model ID to check
 * @param forceSingleFileRead Optional user setting to force or disable single-file reads
 * @returns true if the model should use single file reads
 */
export function shouldUseSingleFileRead(modelId: string, forceSingleFileRead?: boolean | null): boolean {
	if (forceSingleFileRead === true) {
		return true
	}

	if (forceSingleFileRead === false) {
		return false
	}

	return modelId.includes("claude-haiku-4.5") || modelId.includes("claude-haiku-4-5") // kilocode_change
}
