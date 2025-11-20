/**
 * Configuration for models that should use simplified single-file read_file tool
 * These models will use the simpler <read_file><path>...</path></read_file> format
 * instead of the more complex multi-file args format
 */

export const SINGLE_FILE_READ_MODES = ["auto", "single", "multi"] as const

export type SingleFileReadMode = (typeof SINGLE_FILE_READ_MODES)[number]

/**
 * Check if a model should use single file read format
 * @param modelId The model ID to check
 * @param mode Optional override mode that can force single or multi-file reads
 * @returns true if the model should use single file reads
 */
export function shouldUseSingleFileRead(modelId: string, mode: SingleFileReadMode = "auto"): boolean {
	if (mode === "single") {
		return true
	}

	if (mode === "multi") {
		return false
	}

	if (!modelId) {
		return false
	}

	return modelId.includes("claude-haiku-4.5") || modelId.includes("claude-haiku-4-5") // kilocode_change
}
