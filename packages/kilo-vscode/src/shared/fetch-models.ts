/**
 * Fetch available models from an OpenAI-compatible /models endpoint.
 * Runs in the extension host — no CLI backend dependency.
 */

type Options = {
  baseURL: string
  apiKey?: string
  headers?: Record<string, string>
  onRetry?: (retry: { attempt: number; maxRetries: number; nextDelayMs: number }) => void
  wait?: (ms: number) => Promise<void>
}

type ModelEntry = {
  id: string
  name: string
}

export class FetchModelsError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message)
    this.name = "FetchModelsError"
  }

  get auth() {
    return this.status === 401 || this.status === 403
  }
}

const TIMEOUT_MS = 15_000
const MAX_RETRIES = 4
const BASE_DELAY_MS = 1_000
const MAX_DELAY_MS = 8_000

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds > 0) {
    return Math.ceil(seconds * 1000)
  }

  const when = Date.parse(value)
  if (Number.isNaN(when)) return undefined
  const delay = when - Date.now()
  if (delay <= 0) return undefined
  return delay
}

function backoff(attempt: number, retryAfter: string | null): number {
  const hinted = parseRetryAfter(retryAfter)
  const exp = Math.min(BASE_DELAY_MS * Math.pow(2, attempt - 1), MAX_DELAY_MS)
  if (!hinted) return exp
  return Math.max(exp, Math.min(hinted, MAX_DELAY_MS))
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function fetchOpenAIModels(opts: Options): Promise<ModelEntry[]> {
  const url = opts.baseURL.replace(/\/+$/, "") + "/models"
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...opts.headers,
  }
  if (opts.apiKey) {
    headers["Authorization"] = `Bearer ${opts.apiKey}`
  }

  const wait = opts.wait ?? sleep

  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    const response = await fetch(url, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })

    if (response.ok) {
      const body = (await response.json()) as { data?: Array<{ id?: string; name?: string }> }
      const items = body?.data
      if (!Array.isArray(items)) return []

      const seen = new Set<string>()
      const result: ModelEntry[] = []
      for (const item of items) {
        const id = typeof item.id === "string" ? item.id.trim() : ""
        if (!id || seen.has(id)) continue
        seen.add(id)
        result.push({ id, name: typeof item.name === "string" ? item.name.trim() : id })
      }
      result.sort((a, b) => a.id.localeCompare(b.id))
      return result
    }

    const text = await response.text().catch(() => "")
    if (response.status !== 429) {
      throw new FetchModelsError(`HTTP ${response.status}: ${text.slice(0, 200)}`, response.status)
    }

    if (attempt > MAX_RETRIES) {
      throw new FetchModelsError("Rate limit reached after multiple retries. Please try again shortly.", response.status)
    }

    const nextDelayMs = backoff(attempt, response.headers.get("Retry-After"))
    opts.onRetry?.({ attempt, maxRetries: MAX_RETRIES, nextDelayMs })
    await wait(nextDelayMs)
  }

  throw new FetchModelsError("Failed to fetch models")
}
