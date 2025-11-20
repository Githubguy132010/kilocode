import { describe, expect, it } from "vitest"

import { shouldUseSingleFileRead } from "../single-file-read-models"

describe("shouldUseSingleFileRead", () => {
	it("forces single-file reads when explicitly enabled", () => {
		expect(shouldUseSingleFileRead("any-model", true)).toBe(true)
	})

	it("disables single-file reads when explicitly disabled", () => {
		expect(shouldUseSingleFileRead("claude-haiku-4.5", false)).toBe(false)
	})

	it("falls back to model defaults when setting is not provided", () => {
		expect(shouldUseSingleFileRead("claude-haiku-4.5")).toBe(true)
		expect(shouldUseSingleFileRead("gpt-4.1-mini")).toBe(false)
	})
})
