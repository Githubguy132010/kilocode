// kilocode_change - new file
//
// Single entry point for every call to `structuredPatch`/`formatPatch` in the
// codebase. The underlying npm `diff` package uses Myers' algorithm with full
// context, which is O(N*M) in time and memory. On files with tens of thousands
// of lines it can block the thread for minutes. That is what caused the TUI
// freeze where ESC no longer worked after a turn.
//
// Two defenses live here:
//
// 1. Input-side caps (`shouldSkip`) — if a file is clearly too big to diff in
//    a reasonable time, skip the patch body outright and return `{ patch: "" }`
//    plus a reason. This is the primary fix and it is cheap.
// 2. Worker offload (`patchAsync`) — even for inputs that slip past the caps,
//    run the Myers pass in a dedicated Web Worker with a hard timeout, so the
//    main event loop keeps breathing. This is the safety net.
//
// Both defenses are controlled by `Flag.KILO_DIFF_CAPS` and `Flag.KILO_DIFF_WORKER`
// so they can be turned off individually for rollback without code changes.

import { fileURLToPath } from "url"
import { formatPatch, structuredPatch } from "diff"
import { Filesystem } from "../../util/filesystem"
import { Flag } from "../../flag/flag"
import { Log } from "../../util/log"

declare global {
  const KILO_DIFF_WORKER_PATH: string | undefined
}

export namespace DiffEngine {
  const log = Log.create({ service: "diff-engine" })

  /** Hard byte cap on a single side (before or after) of a diff. 512 KB. */
  export const MAX_INPUT_BYTES = 512 * 1024
  /** Hard line cap on a single side of a diff. */
  export const MAX_INPUT_LINES = 2000
  /** Max ms to wait on a worker call before giving up and returning "timeout". */
  export const DEFAULT_TIMEOUT_MS = 10_000
  /** Under this size/line count we skip the worker round-trip — the sync call is faster. */
  const SYNC_BYTES = 50 * 1024
  const SYNC_LINES = 500

  export type SkipReason = "oversized" | "too-many-lines" | "timeout" | "worker-error"

  export type Opts = {
    context?: number
    ignoreWhitespace?: boolean
    timeout?: number
    signal?: AbortSignal
  }

  export interface Result {
    patch: string
    skipped?: SkipReason
  }

  function lines(text: string) {
    if (!text) return 0
    const len = text.length
    if (len === 0) return 0
    let count = 1
    for (let i = 0; i < len; i++) {
      if (text.charCodeAt(i) === 10) count++
    }
    // trailing newline does not create an extra line
    if (text.charCodeAt(len - 1) === 10) count--
    return count
  }

  /** Returns the skip reason, or undefined if the inputs are small enough to diff directly. */
  export function shouldSkip(before: string, after: string): SkipReason | undefined {
    if (!Flag.KILO_DIFF_CAPS) return undefined
    if (before.length > MAX_INPUT_BYTES || after.length > MAX_INPUT_BYTES) return "oversized"
    if (lines(before) > MAX_INPUT_LINES || lines(after) > MAX_INPUT_LINES) return "too-many-lines"
    return undefined
  }

  function formatSync(file: string, before: string, after: string, opts: Opts): string {
    const ctx = opts.context ?? Number.MAX_SAFE_INTEGER
    return formatPatch(
      structuredPatch(file, file, before, after, "", "", {
        context: Number.isFinite(ctx) ? ctx : Number.MAX_SAFE_INTEGER,
        ignoreWhitespace: opts.ignoreWhitespace,
      }),
    )
  }

  /** Synchronous patch with input caps. Safe only for callers that tolerate ~100ms blocking. */
  export function patchSync(file: string, before: string, after: string, opts: Opts = {}): Result {
    const skipped = shouldSkip(before, after)
    if (skipped) return { patch: "", skipped }
    return { patch: formatSync(file, before, after, opts) }
  }

  // ---------------------------------------------------------------------------
  // Worker pool (singleton)
  // ---------------------------------------------------------------------------

  type Pending = {
    resolve: (value: Result) => void
    timer: ReturnType<typeof setTimeout>
    signal?: AbortSignal
    onAbort?: () => void
  }

  type Pool = {
    worker: Worker
    pending: Map<number, Pending>
  }

  let pool: Pool | null = null
  let pending: Promise<Pool | null> | null = null
  let nextId = 1
  let warnedFallback = false

  async function resolveWorkerPath(): Promise<string | URL | undefined> {
    // Bundled build: the define from script/build.ts hands us the absolute path.
    if (typeof KILO_DIFF_WORKER_PATH !== "undefined" && KILO_DIFF_WORKER_PATH) {
      return KILO_DIFF_WORKER_PATH
    }
    // Dev mode: resolve the `.ts` sibling via import.meta.url.
    const dist = new URL("./diff-worker.js", import.meta.url)
    if (await Filesystem.exists(fileURLToPath(dist))) return dist
    return new URL("./diff-worker.ts", import.meta.url)
  }

  function drainPending(next: Pool, reason: Result["skipped"]) {
    for (const entry of next.pending.values()) {
      clearTimeout(entry.timer)
      if (entry.signal && entry.onAbort) entry.signal.removeEventListener("abort", entry.onAbort)
      entry.resolve({ patch: "", skipped: reason })
    }
    next.pending.clear()
  }

  async function build(): Promise<Pool | null> {
    if (!Flag.KILO_DIFF_WORKER) return null
    const file = await resolveWorkerPath()
    if (!file) return null
    try {
      const worker = new Worker(file, { name: "diff-worker" } as WorkerOptions)
      const next: Pool = { worker, pending: new Map<number, Pending>() }

      worker.onmessage = (evt: MessageEvent<{ id: number; patch?: string; error?: string }>) => {
        const res = evt.data
        const entry = next.pending.get(res.id)
        if (!entry) return
        clearTimeout(entry.timer)
        if (entry.signal && entry.onAbort) entry.signal.removeEventListener("abort", entry.onAbort)
        next.pending.delete(res.id)
        if (res.error) {
          entry.resolve({ patch: "", skipped: "worker-error" })
          return
        }
        entry.resolve({ patch: res.patch ?? "" })
      }

      const onError = (err: unknown) => {
        log.warn("diff worker crashed, will restart on next call", {
          error: err instanceof Error ? err.message : String(err),
        })
        drainPending(next, "worker-error")
        if (pool === next) {
          pool = null
          try {
            next.worker.terminate()
          } catch (err) {
            log.debug("diff worker terminate after crash failed", {
              error: err instanceof Error ? err.message : String(err),
            })
          }
        }
      }
      worker.onerror = (evt) => onError(evt instanceof ErrorEvent ? (evt.error ?? evt.message) : evt)

      return next
    } catch (err) {
      if (!warnedFallback) {
        warnedFallback = true
        log.warn("failed to construct diff worker, falling back to sync path", {
          error: err instanceof Error ? err.message : String(err),
        })
      }
      return null
    }
  }

  // Concurrent callers share the same construction promise. Without this gate,
  // a batch of concurrent patchAsync calls (e.g. `Effect.forEach` with
  // `concurrency: 8`) would all race past the `if (pool)` check and each
  // spawn its own Worker, with last-write-wins leaking the others.
  async function ensurePool(): Promise<Pool | null> {
    if (pool) return pool
    if (!Flag.KILO_DIFF_WORKER) return null
    if (!pending) {
      pending = build()
        .then((next) => {
          if (next) pool = next
          return next
        })
        .finally(() => {
          pending = null
        })
    }
    return pending
  }

  function terminate() {
    const hit = pool
    if (!hit) return
    pool = null
    try {
      hit.worker.terminate()
    } catch (err) {
      log.debug("diff worker terminate failed", {
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  // Scoped terminate: only tears down the pool that owns the failing request.
  // If a newer pool has already replaced it, we leave the current one alone so
  // a stale timer or abort cannot spawn a fresh worker (and kill unrelated
  // in-flight work).
  function terminatePool(p: Pool) {
    if (pool === p) pool = null
    try {
      p.worker.terminate()
    } catch (err) {
      log.debug("diff worker terminate failed", {
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  /**
   * Offloaded patch generation. Applies the input caps first (fast-path skip),
   * then dispatches to the singleton worker with a bounded timeout. If the
   * worker is unavailable or disabled, falls back to the sync implementation.
   */
  export async function patchAsync(file: string, before: string, after: string, opts: Opts = {}): Promise<Result> {
    const skipped = shouldSkip(before, after)
    if (skipped) return { patch: "", skipped }

    // Tiny files: sync is cheaper than postMessage round-trip.
    if (
      before.length < SYNC_BYTES &&
      after.length < SYNC_BYTES &&
      lines(before) < SYNC_LINES &&
      lines(after) < SYNC_LINES
    ) {
      return { patch: formatSync(file, before, after, opts) }
    }

    const p = await ensurePool()
    if (!p) return { patch: formatSync(file, before, after, opts) }

    const id = nextId++
    const timeout = opts.timeout ?? DEFAULT_TIMEOUT_MS

    return new Promise<Result>((resolve) => {
      const entry: Pending = {
        resolve,
        timer: setTimeout(() => {
          p.pending.delete(id)
          if (entry.signal && entry.onAbort) entry.signal.removeEventListener("abort", entry.onAbort)
          log.warn("diff worker timed out, terminating", { file, timeout })
          terminatePool(p)
          resolve({ patch: "", skipped: "timeout" })
        }, timeout),
      }

      if (opts.signal) {
        entry.signal = opts.signal
        entry.onAbort = () => {
          p.pending.delete(id)
          clearTimeout(entry.timer)
          // Interruption means the caller no longer cares — don't bother finishing.
          terminatePool(p)
          resolve({ patch: "", skipped: "timeout" })
        }
        if (opts.signal.aborted) {
          entry.onAbort()
          return
        }
        opts.signal.addEventListener("abort", entry.onAbort, { once: true })
      }

      p.pending.set(id, entry)
      p.worker.postMessage({
        id,
        file,
        before,
        after,
        opts: { context: opts.context, ignoreWhitespace: opts.ignoreWhitespace },
      })
    })
  }

  /** Test/shutdown helper — tears down the worker so the process can exit cleanly. */
  export async function shutdown() {
    const hit = pool
    if (!hit) return
    pool = null
    drainPending(hit, "worker-error")
    try {
      hit.worker.terminate()
    } catch (err) {
      log.debug("diff worker shutdown terminate failed", {
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  /** Visible for testing — not a stable API. */
  export const _internal = {
    get hasPool() {
      return pool !== null
    },
    resolveWorkerPath,
  }
}
