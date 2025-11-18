import { ToolArgs } from "./types"

export function getDeleteFileOrFolderDescription(args: ToolArgs): string {
	return `## delete_file_or_folder
Description: Request to delete a file or directory. Paths must be within the current workspace (${args.cwd}). Directories require recursive=true.
Parameters:
- path: (required) The file or directory to delete, relative to the workspace.
- recursive: (optional) Set to true to delete directories and their contents. Leaving this false will reject directory deletion requests.
Usage:
<delete_file_or_folder>
<path>relative/path/to/file.txt</path>
<recursive>false</recursive>
</delete_file_or_folder>

Example: Recursively delete a directory named temp
<delete_file_or_folder>
<path>temp</path>
<recursive>true</recursive>
</delete_file_or_folder>`
}
