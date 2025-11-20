/**
 * Configuration for models that should use simplified single-file read_file tool
 * These models will use the simpler <read_file><path>...</path></read_file> format
 * instead of the more complex multi-file args format
 */

/**
 * Determines whether a model should use the simplified single-file read format.
 *
 * @param modelId - Identifier of the model to evaluate.
 * @param forceSingleFileRead - Optional override: `true` to force single-file reads, `false` to disable, `null` or `undefined` to use the default heuristic.
 * @returns `true` if the model should use single-file reads, `false` otherwise.
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