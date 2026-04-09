import friendlyWords from "friendly-words"
import type { KiloClient } from "@kilocode/sdk/v2/client"

const MAX_ATTEMPTS = 10
const FALLBACK_MAX_SUFFIX = 100
const AUTO_PREFIX = "kilo-worktree"

/**
 * Sanitize a string into a valid git branch name.
 * Keeps lowercase alphanumeric chars, hyphens, and forward slashes (namespace
 * separator), collapses runs, strips edges.
 */
export function sanitizeBranchName(name: string, maxLength = 50): string {
  return name
    .slice(0, maxLength)
    .toLowerCase()
    .replace(/[^a-z0-9/]+/g, "-")
    .replace(/^[-/]+|[-/]+$/g, "")
    .replace(/-+/g, "-")
    .replace(/\/+/g, "/")
    .replace(/-\//g, "/")
    .replace(/\/-/g, "/")
}

/**
 * Generate an auto branch name for a worktree. Task prompts become grouped
 * `kilo-worktree/<task-slug>` refs; prompt-less flows fall back to friendly words.
 */
export function generateBranchName(prompt?: string, existingBranches: string[] = []): string {
  const predicates = friendlyWords.predicates as string[]
  const objects = friendlyWords.objects as string[]
  const existing = new Set(existingBranches.map((b) => b.toLowerCase()))

  const random = () => {
    const predicate = predicates[Math.floor(Math.random() * predicates.length)]
    const object = objects[Math.floor(Math.random() * objects.length)]
    return `${AUTO_PREFIX}/${predicate}-${object}`
  }

  const unique = (base: string) => {
    if (!existing.has(base.toLowerCase())) return base

    for (let n = 2; n < FALLBACK_MAX_SUFFIX + 2; n++) {
      const candidate = `${base}-${n}`
      if (!existing.has(candidate.toLowerCase())) return candidate
    }

    return `${base}-${Date.now()}`
  }

  const slug = prompt ? sanitizeBranchName(prompt) : ""
  if (slug) return unique(`${AUTO_PREFIX}/${slug}`)

  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const candidate = random()
    if (!existing.has(candidate.toLowerCase())) return candidate
  }

  return unique(random())
}

/**
 * Compute the branch name and display label for a version in a multi-version group.
 * Returns undefined values when no custom name is provided (falls back to auto-generated).
 */
export function versionedName(
  base: string | undefined,
  index: number,
  total: number,
): { branch: string | undefined; label: string | undefined } {
  if (!base) return { branch: undefined, label: undefined }
  if (total > 1 && index > 0) {
    return {
      branch: `${base}_v${index + 1}`,
      label: `${base} v${index + 1}`,
    }
  }
  return { branch: base, label: base }
}

/**
 * Resolve the branch name for a new worktree. If no explicit branch name is
 * provided and a prompt is available, calls the LLM endpoint on the server to
 * generate a meaningful slug.  Falls back to `undefined` (triggering slug-based
 * generation in WorktreeManager) when the LLM call fails or returns nothing.
 */
export async function resolveWorktreeBranchName(
  client: KiloClient,
  explicitBranch: string | undefined,
  prompt: string | undefined,
  onError: (err: unknown) => void,
): Promise<string | undefined> {
  if (explicitBranch || !prompt) return explicitBranch
  try {
    const { data } = await client.branchName.generate({ prompt })
    return data?.branch ? `${AUTO_PREFIX}/${data.branch}` : undefined
  } catch (err) {
    onError(err)
    return undefined
  }
}
