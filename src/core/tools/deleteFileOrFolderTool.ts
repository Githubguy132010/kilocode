import fs from "fs/promises"
import os from "os"
import path from "path"

import { Task } from "../task/Task"
import { formatResponse } from "../prompts/responses"
import { getReadablePath } from "../../utils/path"
import { isPathOutsideWorkspace } from "../../utils/pathUtils"
import { ToolUse, AskApproval, HandleError, PushToolResult, RemoveClosingTag } from "../../shared/tools"

function parseRecursiveFlag(recursive: unknown): boolean {
	if (typeof recursive === "boolean") return recursive
	if (typeof recursive === "string") return recursive.toLowerCase() === "true"
	return false
}

function isProtectedSystemPath(targetPath: string): boolean {
	const normalized = path.resolve(targetPath)
	const rootPath = path.parse(normalized).root
	const homeDir = os.homedir()

	const protectedPaths = new Set([
		rootPath,
		homeDir,
		"/bin",
		"/boot",
		"/dev",
		"/etc",
		"/lib",
		"/lib64",
		"/proc",
		"/root",
		"/run",
		"/sbin",
		"/sys",
		"/usr",
		"/var",
	])

	return protectedPaths.has(normalized)
}

function isDangerousRecursiveTarget(targetPath: string, recursive: boolean): boolean {
	if (!recursive) return false
	const normalized = path.resolve(targetPath)
	const rootPath = path.parse(normalized).root
	const homeDir = os.homedir()
	return normalized === rootPath || normalized === homeDir
}

export async function deleteFileOrFolderTool(
	cline: Task,
	block: ToolUse,
	askApproval: AskApproval,
	handleError: HandleError,
	pushToolResult: PushToolResult,
	removeClosingTag: RemoveClosingTag,
) {
	const relPath: string | undefined = block.params.path
	const recursive = parseRecursiveFlag(block.params.recursive)

	if (block.partial) {
		return
	}

	if (!relPath) {
		cline.consecutiveMistakeCount++
		cline.recordToolError("delete_file_or_folder")
		pushToolResult(await cline.sayAndCreateMissingParamError("delete_file_or_folder", "path"))
		return
	}

	const targetPath = path.resolve(cline.cwd, removeClosingTag("path", relPath))

	if (isPathOutsideWorkspace(targetPath)) {
		cline.recordToolError("delete_file_or_folder")
		pushToolResult(
			formatResponse.toolError(
				"Deletion aborted: path is outside the current workspace. Refusing to modify files outside the workspace.",
			),
		)
		return
	}

	if (isProtectedSystemPath(targetPath) || isDangerousRecursiveTarget(targetPath, recursive)) {
		cline.recordToolError("delete_file_or_folder")
		pushToolResult(
			formatResponse.toolError(
				"Deletion aborted: target path is protected to prevent destructive operations on system or home directories.",
			),
		)
		return
	}

	try {
		const stats = await fs.stat(targetPath)
		const readablePath = getReadablePath(cline.cwd, removeClosingTag("path", relPath))

		if (stats.isDirectory() && !recursive) {
			cline.recordToolError("delete_file_or_folder")
			pushToolResult(
				formatResponse.toolError(
					"Deletion aborted: target is a directory. Use recursive=true to delete directories.",
				),
			)
			return
		}

		const approvalMessage = JSON.stringify({
			tool: "deleteFileOrFolder",
			path: readablePath,
			recursive,
		})

		const didApprove = await askApproval("tool", approvalMessage)

		if (!didApprove) {
			return
		}

		await fs.rm(targetPath, { recursive: stats.isDirectory(), force: false })

		pushToolResult(
			formatResponse.toolResult(
				`${stats.isDirectory() ? "Directory" : "File"} deleted: ${readablePath}${
					recursive && stats.isDirectory() ? " (recursive)" : ""
				}`,
			),
		)
	} catch (error: any) {
		if (error?.code === "ENOENT") {
			pushToolResult(formatResponse.toolError("Deletion aborted: path does not exist."))
			return
		}

		await handleError("deleting file or folder", error as Error)
	}
}
