import friendlyWords from "friendly-words"

const MAX_ATTEMPTS = 10
const FALLBACK_MAX_SUFFIX = 100
const MAX_PREFIX_LENGTH = 255
export const DEFAULT_WORKTREE_PREFIX = "kilo-worktree"

export function normalizeWorktreePrefix(prefix: string | undefined): string {
  return sanitizeBranchName(prefix ?? "", MAX_PREFIX_LENGTH).replace(/\/+$/g, "")
}

function applyPrefix(prefix: string | undefined, name: string): string {
  const base = normalizeWorktreePrefix(prefix)
  if (!base) return name
  return `${base}/${name}`
}

/**
 * Sanitize a string into a valid git branch name segment.
 * Keeps lowercase alphanumeric chars, hyphens, and slashes, collapses runs, strips edges.
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
 * Generate an auto branch name for a worktree.
 * Uses the prompt when available, falls back to friendly words when not,
 * and applies the configured prefix unless it is empty.
 */
export function generateBranchName(
  prompt: string | undefined,
  existingBranches: string[] = [],
  prefix = DEFAULT_WORKTREE_PREFIX,
): string {
  const predicates = friendlyWords.predicates as string[]
  const objects = friendlyWords.objects as string[]
  const existing = new Set(existingBranches.map((b) => b.toLowerCase()))

  const random = () => {
    const predicate = predicates[Math.floor(Math.random() * predicates.length)]
    const object = objects[Math.floor(Math.random() * objects.length)]
    return applyPrefix(prefix, `${predicate}-${object}`)
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
  if (slug) return unique(applyPrefix(prefix, slug))

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
