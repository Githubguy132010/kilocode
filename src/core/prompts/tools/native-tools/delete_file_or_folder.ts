import type OpenAI from "openai"

export default {
	type: "function",
	function: {
		name: "delete_file_or_folder",
		description:
			"Delete a file or directory within the workspace. Directories require recursive=true. Refuses to delete protected or system paths.",
		strict: true,
		parameters: {
			type: "object",
			properties: {
				path: {
					type: "string",
					description: "File or directory path to delete, relative to the workspace",
				},
				recursive: {
					type: ["boolean"],
					description: "Set true to delete directories recursively. Leave false for files only.",
				},
			},
			required: ["path"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool
