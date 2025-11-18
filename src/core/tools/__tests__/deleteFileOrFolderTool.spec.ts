import fs from "fs/promises"
import os from "os"
import path from "path"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { deleteFileOrFolderTool } from "../deleteFileOrFolderTool"
import { formatResponse } from "../../prompts/responses"
import { isPathOutsideWorkspace } from "../../../utils/pathUtils"
import { ToolUse, AskApproval, HandleError, PushToolResult, RemoveClosingTag } from "../../../shared/tools"
import { Task } from "../../task/Task"

vi.mock("../../prompts/responses", () => ({
	formatResponse: {
		toolError: vi.fn((message: string) => `error: ${message}`),
		toolResult: vi.fn((message: string) => message),
	},
}))

vi.mock("../../../utils/pathUtils", () => ({
	isPathOutsideWorkspace: vi.fn(),
}))

describe("deleteFileOrFolderTool", () => {
	let tempDir: string
	let mockCline: any & { consecutiveMistakeCount: number }
	let mockAskApproval: AskApproval
	let mockHandleError: HandleError
	let mockPushToolResult: PushToolResult
	let mockRemoveClosingTag: RemoveClosingTag
	let mockToolUse: ToolUse

	const mockedIsPathOutsideWorkspace = vi.mocked(isPathOutsideWorkspace)

	beforeEach(async () => {
		tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "delete-tool-"))
		mockedIsPathOutsideWorkspace.mockReturnValue(false)

		mockCline = {
			cwd: tempDir,
			consecutiveMistakeCount: 0,
			recordToolError: vi.fn(),
			sayAndCreateMissingParamError: vi.fn().mockResolvedValue("missing param"),
		}

		mockAskApproval = vi.fn().mockResolvedValue(true)
		mockHandleError = vi.fn()
		mockPushToolResult = vi.fn()
		mockRemoveClosingTag = vi.fn((_, content?: string) => content ?? "")

		mockToolUse = {
			type: "tool_use",
			name: "delete_file_or_folder",
			params: {},
			partial: false,
		}
	})

	afterEach(async () => {
		await fs.rm(tempDir, { recursive: true, force: true })
		vi.clearAllMocks()
	})

	it("deletes a directory recursively when approved", async () => {
		const targetDir = path.join(tempDir, "nested")
		await fs.mkdir(targetDir)
		await fs.writeFile(path.join(targetDir, "file.txt"), "content")

		mockToolUse.params = { path: "nested", recursive: "true" }

		await deleteFileOrFolderTool(
			mockCline as unknown as Task,
			mockToolUse,
			mockAskApproval,
			mockHandleError,
			mockPushToolResult,
			mockRemoveClosingTag,
		)

		await expect(fs.stat(targetDir)).rejects.toThrow()
		expect(mockAskApproval).toHaveBeenCalled()
		expect(formatResponse.toolResult).toHaveBeenCalled()
		expect(mockPushToolResult).toHaveBeenCalledWith(expect.stringContaining("Directory deleted"))
	})

	it("rejects deletion outside the workspace", async () => {
		mockedIsPathOutsideWorkspace.mockReturnValue(true)
		mockToolUse.params = { path: "../outside" }

		await deleteFileOrFolderTool(
			mockCline as unknown as Task,
			mockToolUse,
			mockAskApproval,
			mockHandleError,
			mockPushToolResult,
			mockRemoveClosingTag,
		)

		expect(mockCline.recordToolError).toHaveBeenCalledWith("delete_file_or_folder")
		expect(mockPushToolResult).toHaveBeenCalledWith(expect.stringContaining("outside the current workspace"))
		expect(mockAskApproval).not.toHaveBeenCalled()
	})

	it("rejects dangerous recursive targets", async () => {
		mockedIsPathOutsideWorkspace.mockReturnValue(false)
		mockToolUse.params = { path: "/", recursive: "true" }

		await deleteFileOrFolderTool(
			mockCline as unknown as Task,
			mockToolUse,
			mockAskApproval,
			mockHandleError,
			mockPushToolResult,
			mockRemoveClosingTag,
		)

		expect(mockPushToolResult).toHaveBeenCalledWith(expect.stringContaining("protected"))
		expect(mockAskApproval).not.toHaveBeenCalled()
	})

	it("returns an error for non-existent paths", async () => {
		mockToolUse.params = { path: "missing.txt" }

		await deleteFileOrFolderTool(
			mockCline as unknown as Task,
			mockToolUse,
			mockAskApproval,
			mockHandleError,
			mockPushToolResult,
			mockRemoveClosingTag,
		)

		expect(mockPushToolResult).toHaveBeenCalledWith("error: Deletion aborted: path does not exist.")
		expect(mockHandleError).not.toHaveBeenCalled()
	})
})
