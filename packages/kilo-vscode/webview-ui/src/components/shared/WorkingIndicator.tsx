/**
 * WorkingIndicator component
 * Shows a spinner, status text, and elapsed time counter while the agent is active.
 * Matches the v1.0.25 working indicator UX.
 */

/** @jsxImportSource solid-js */

import { Show, createSignal, createEffect, onCleanup } from "solid-js"
import type { Component } from "solid-js"
import { Icon } from "@kilocode/kilo-ui/icon"
import { Spinner } from "@kilocode/kilo-ui/spinner"
import { useSession } from "../../context/session"
import { useLanguage } from "../../context/language"

const DoneIcon = Icon as unknown as Component<{ name: string; size?: string }>
const BusySpinner = Spinner as unknown as Component<{ class?: string }>

export const WorkingIndicator: Component = () => {
  const session = useSession()
  const language = useLanguage()

  const [elapsed, setElapsed] = createSignal(0)
  const [retryCountdown, setRetryCountdown] = createSignal(0)
  const [done, setDone] = createSignal<{ text: string; elapsed?: number }>()

  createEffect(() => {
    const since = session.busySince()
    const status = session.status()

    if (status === "idle" || !since) {
      setElapsed(0)
      return
    }

    setDone(undefined)

    setElapsed(Math.floor((Date.now() - since) / 1000))

    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - since) / 1000))
    }, 1000)

    onCleanup(() => clearInterval(id))
  })

  createEffect(() => {
    const info = session.statusInfo()
    if (info.type !== "retry") {
      setRetryCountdown(0)
      return
    }

    const target = info.next
    setRetryCountdown(Math.max(0, Math.ceil((target - Date.now()) / 1000)))

    const id = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((target - Date.now()) / 1000))
      setRetryCountdown(remaining)
      if (remaining <= 0) clearInterval(id)
    }, 1000)

    onCleanup(() => clearInterval(id))
  })

  const statusText = () => {
    const info = session.statusInfo()
    if (info.type === "retry") {
      const countdown = retryCountdown()
      const retryMsg = info.message || language.t("session.status.retry")
      return countdown > 0 ? `${retryMsg} (${countdown}s)` : retryMsg
    }
    return session.statusText() ?? language.t("ui.sessionTurn.status.thinking")
  }

  const formatElapsed = () => {
    const s = elapsed()
    if (s < 60) return `${s}s`
    const m = Math.floor(s / 60)
    const rem = s % 60
    return `${m}m ${rem}s`
  }

  const blocked = () => {
    const id = session.currentSessionID()
    const perms = session
      .permissions()
      .filter((p) => p.sessionID === id && !(p.tool && ["todowrite", "todoread"].includes(p.toolName)))
    const questions = session.questions().filter((q) => q.sessionID === id)
    return perms.length > 0 || questions.length > 0
  }

  createEffect(() => {
    const status = session.status()
    const since = session.busySince()
    if (status !== "idle" || !since || blocked()) return

    const text = (() => {
      const summary = session.summary()
      if (!summary) return language.t("ui.sessionTurn.status.done")
      return language.t("ui.sessionTurn.status.done")
    })()

    setDone({
      text,
      elapsed: Math.max(1, Math.floor((Date.now() - since) / 1000)),
    })

    const id = setTimeout(() => setDone(undefined), 6000)
    onCleanup(() => clearTimeout(id))
  })

  return (
    <Show when={!blocked() && (session.status() !== "idle" || done())}>
      <div class="working-indicator" data-state={session.status() !== "idle" ? "working" : "done"}>
        <Show
          when={session.status() !== "idle"}
          fallback={
            <>
              <span class="working-icon working-icon-done" aria-hidden="true">
                <DoneIcon name="check" size="small" />
              </span>
              <span class="working-text working-text-done">{done()?.text}</span>
              <Show when={done()?.elapsed}>
                <span class="working-elapsed">{done()?.elapsed}s</span>
              </Show>
            </>
          }
        >
          <BusySpinner />
          <span class="working-text">{statusText()}</span>
          <Show when={elapsed() > 0}>
            <span class="working-elapsed">{formatElapsed()}</span>
          </Show>
        </Show>
      </div>
    </Show>
  )
}
