import { describe, expect, it, vi } from "vitest"

vi.mock("../../tools/simpleReadFileTool", () => ({
	simpleReadFileTool: vi.fn().mockResolvedValue(undefined),
	getSimpleReadFileToolDescription: vi.fn(),
}))

vi.mock("../../tools/readFileTool", () => ({
	readFileTool: vi.fn().mockResolvedValue(undefined),
	getReadFileToolDescription: vi.fn(),
}))

vi.mock("@roo-code/telemetry", () => ({
	TelemetryService: {
		instance: {
			captureToolUsage: vi.fn(),
			captureConsecutiveMistakeError: vi.fn(),
		},
	},
}))

import { presentAssistantMessage } from "../presentAssistantMessage"
import { simpleReadFileTool } from "../../tools/simpleReadFileTool"
import { readFileTool } from "../../tools/readFileTool"

describe("presentAssistantMessage - read_file routing", () => {
	it("uses the simple read file tool when forced via settings", async () => {
		const cline: any = {
			abort: false,
			presentAssistantMessageLocked: false,
			presentAssistantMessageHasPendingUpdates: false,
			currentStreamingContentIndex: 0,
			assistantMessageContent: [
				{
					type: "tool_use",
					name: "read_file",
					params: { path: "test.txt" },
					partial: false,
				},
			],
			didRejectTool: false,
			didAlreadyUseTool: false,
			didCompleteReadingStream: true,
			api: {
				getModel: () => ({ id: "gpt-4", info: {} }),
			},
			providerRef: {
				deref: () => ({
					getState: vi.fn().mockResolvedValue({ forceSingleFileRead: true }),
				}),
			},
			say: vi.fn(),
			ask: vi.fn().mockResolvedValue({ response: "yesButtonClicked" }),
			userMessageContent: [],
			assistantMessageContentReady: false,
			browserSession: { closeBrowser: vi.fn() },
			recordToolUsage: vi.fn(),
			rooIgnoreController: { validateAccess: () => true },
			fileContextTracker: { trackFileContext: vi.fn() },
			toolRepetitionDetector: {
				check: vi.fn().mockReturnValue({ allowed: true }),
			},
			consecutiveMistakeCount: 0,
			recordToolError: vi.fn(),
		}

		await presentAssistantMessage(cline)

		expect(simpleReadFileTool).toHaveBeenCalled()
		expect(readFileTool).not.toHaveBeenCalled()
	})
})
