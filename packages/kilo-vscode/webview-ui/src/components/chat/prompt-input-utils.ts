export function fileName(path: string): string {
  const normalized = path.replaceAll("\\", "/").replace(/\/+$/, "")
  return normalized.split("/").pop() ?? normalized
}

export function dirName(path: string): string {
  const parts = path.replaceAll("\\", "/").replace(/\/+$/, "").split("/")
  if (parts.length <= 1) return ""
  const dir = parts.slice(0, -1).join("/")
  return dir.length > 30 ? `…/${parts.slice(-3, -1).join("/")}` : dir
}

export function buildHighlightSegments(val: string, paths: Set<string>): { text: string; highlight: boolean }[] {
  if (paths.size === 0) return [{ text: val, highlight: false }]

  const segments: { text: string; highlight: boolean }[] = []
  let remaining = val

  while (remaining.length > 0) {
    let earliest = -1
    let earliestPath = ""

    for (const path of paths) {
      const token = `@${path}`
      const idx = remaining.indexOf(token)
      if (idx !== -1 && (earliest === -1 || idx < earliest)) {
        earliest = idx
        earliestPath = path
      }
    }

    if (earliest === -1) {
      segments.push({ text: remaining, highlight: false })
      break
    }

    if (earliest > 0) {
      segments.push({ text: remaining.substring(0, earliest), highlight: false })
    }

    const token = `@${earliestPath}`
    segments.push({ text: token, highlight: true })
    remaining = remaining.substring(earliest + token.length)
  }

  return segments
}

export function atEnd(start: number, end: number, len: number): boolean {
  return start === end && end === len
}

/**
 * Whether the input prompt should be blocked.
 * Only permissions block — questions and suggestions do NOT.
 */
export function isPromptBlocked(permissions: number): boolean {
  return permissions > 0
}

/**
 * Whether the session is busy from the prompt's perspective.
 * Returns false (idle-like) when the session is busy only because
 * a suggestion or question tool call is pending.
 */
export function isPromptBusy(status: string, suggesting: boolean, questioning: boolean): boolean {
  return status !== "idle" && !suggesting && !questioning
}

/**
 * Whether the session is busy only because a suggestion is pending.
 * True when no blocking requests exist and at least one suggestion is active.
 */
export function isSuggesting(blocked: boolean, suggestions: number): boolean {
  return !blocked && suggestions > 0
}

/**
 * Whether the session is busy only because a question is pending.
 * True when no blocking requests exist and at least one question is active.
 */
export function isQuestioning(blocked: boolean, questions: number): boolean {
  return !blocked && questions > 0
}
