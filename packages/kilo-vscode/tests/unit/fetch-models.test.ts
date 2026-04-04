import { describe, expect, it } from "bun:test"
import { fetchOpenAIModels, FetchModelsError } from "../../src/shared/fetch-models"

describe("fetchOpenAIModels", () => {
  it("retries 429 responses with exponential backoff and then succeeds", async () => {
    const old = globalThis.fetch
    const delays: number[] = []
    const calls: Array<{ attempt: number; maxRetries: number; nextDelayMs: number }> = []
    let i = 0

    globalThis.fetch = (async () => {
      i += 1
      if (i <= 2) {
        return new Response("rate limit", {
          status: 429,
          headers: { "Retry-After": String(i) },
        })
      }
      return new Response(JSON.stringify({ data: [{ id: "z-model" }, { id: "a-model", name: "A" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    }) as unknown as typeof globalThis.fetch

    try {
      const models = await fetchOpenAIModels({
        baseURL: "https://example.com/v1",
        onRetry: (retry) => calls.push(retry),
        wait: async (ms) => {
          delays.push(ms)
        },
      })

      expect(models).toEqual([
        { id: "a-model", name: "A" },
        { id: "z-model", name: "z-model" },
      ])
      expect(calls).toEqual([
        { attempt: 1, maxRetries: 4, nextDelayMs: 1000 },
        { attempt: 2, maxRetries: 4, nextDelayMs: 2000 },
      ])
      expect(delays).toEqual([1000, 2000])
    } finally {
      globalThis.fetch = old
    }
  })

  it("does not retry non-429 errors", async () => {
    const old = globalThis.fetch
    let c = 0

    globalThis.fetch = (async () => {
      c += 1
      return new Response("bad", { status: 500 })
    }) as unknown as typeof globalThis.fetch

    try {
      await expect(fetchOpenAIModels({ baseURL: "https://example.com" })).rejects.toThrow(FetchModelsError)
      expect(c).toBe(1)
    } finally {
      globalThis.fetch = old
    }
  })

  it("fails gracefully after max 429 retries", async () => {
    const old = globalThis.fetch
    let c = 0

    globalThis.fetch = (async () => {
      c += 1
      return new Response("slow down", { status: 429 })
    }) as unknown as typeof globalThis.fetch

    try {
      await expect(
        fetchOpenAIModels({
          baseURL: "https://example.com",
          wait: async () => {},
        }),
      ).rejects.toThrow("Rate limit reached after multiple retries")
      expect(c).toBe(5)
    } finally {
      globalThis.fetch = old
    }
  })
})
