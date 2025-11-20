import { ToolArgs } from "./types"

/**
 * Create a compact tool description for single-file read requests.
 *
 * The returned string documents the simplified `<read_file><path>...</path></read_file>` format,
 * states that only one file may be read per request, indicates that output is line-numbered
 * for reference (e.g., `1 | const x = 1`), and embeds the workspace directory from `args.cwd`.
 *
 * @param args - ToolArgs containing the workspace directory (`cwd`) to include in the description
 * @returns A formatted description string describing the simplified single-file `read_file` usage
 */
export function getSimpleReadFileDescription(args: ToolArgs): string {
	return `## read_file
Description: Request to read the contents of a single file using the simplified <read_file><path>...</path></read_file> format. Multiple files are not allowed in the same request while this mode is enabled. The tool outputs line-numbered content (e.g. "1 | const x = 1") for easy reference when discussing code.

Parameters:
- path: (required) File path (relative to workspace directory ${args.cwd})

Usage:
<read_file>
<path>path/to/file</path>
</read_file>

Examples:

1. Reading a TypeScript file:
<read_file>
<path>src/app.ts</path>
</read_file>

2. Reading a configuration file:
<read_file>
<path>config.json</path>
</read_file>

3. Reading a markdown file:
<read_file>
<path>README.md</path>
</read_file>`
}