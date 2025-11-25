/**
 * Configuration for models that should use simplified single-file read_file tool
 * These models will use the simpler <read_file><path>...</path></read_file> format
 * instead of the more complex multi-file args format
 */

/**
 * Check if a model should use single file read format
 * @param modelId The model ID to check
 * @param alwaysUseSimpleReadFile Optional user setting to force simple read file format
 * @returns true if the model should use single file reads
 */
// kilocode_change start
export function shouldUseSingleFileRead(modelId: string, alwaysUseSimpleReadFile?: boolean): boolean {
	// If user has explicitly enabled the simple read file format, always use it
	if (alwaysUseSimpleReadFile) {
		return true
	}
	return modelId.includes("claude-haiku-4.5") || modelId.includes("claude-haiku-4-5")
}
// kilocode_change end
