/**
 * WorkingIndicator component
 * Shows a spinner, status text, and elapsed time counter while the agent is active.
 * Matches the v1.0.25 working indicator UX.
 */

import { Component, Show, createSignal, createEffect, onCleanup } from "solid-js"
import { Collapsible } from "@kilocode/kilo-ui/collapsible"
import { IconButton } from "@kilocode/kilo-ui/icon-button"
import { Spinner } from "@kilocode/kilo-ui/spinner"
import { showToast } from "@kilocode/kilo-ui/toast"
import { useSession } from "../../context/session"
import { useLanguage } from "../../context/language"

export const WorkingIndicator: Component = () => {
  const session = useSession()
  const language = useLanguage()

  const [elapsed, setElapsed] = createSignal(0)
  const [retryCountdown, setRetryCountdown] = createSignal(0)
  const [open, setOpen] = createSignal(false)
  const [copied, setCopied] = createSignal<"message" | "details">()

  createEffect(() => {
    const since = session.busySince()
    const status = session.status()

    if (status === "idle" || !since) {
      setElapsed(0)
      return
    }

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
      setOpen(false)
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
      const msg = info.message || language.t("session.status.retry")
      return countdown > 0 ? `${msg} (${countdown}s)` : msg
    }
    return session.statusText() ?? language.t("ui.sessionTurn.status.thinking")
  }

  const retryMsg = () => {
    const info = session.statusInfo()
    if (info.type !== "retry") return undefined
    return info.message || language.t("session.status.retry")
  }

  const retryDetails = () => {
    const info = session.statusInfo()
    if (info.type !== "retry") return undefined
    return info.details
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

  const retry = () => session.statusInfo().type === "retry"

  const copy = (text: string, kind: "message" | "details") => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(kind)
      showToast({ variant: "success", title: language.t("deviceAuth.toast.errorCopied") })
      setTimeout(() => setCopied(undefined), 2000)
    })
  }

  const copyDetails = () => {
    const text = retryDetails()
    if (!text) return
    copy(text, "details")
  }

  return (
    <Show when={session.status() !== "idle" && !blocked()}>
      <div
        class="working-indicator"
        classList={{
          "working-indicator-wrap": retry(),
          "working-indicator-details": retry() && !!retryDetails(),
        }}
      >
        <Spinner />
        <Show
          when={retry()}
          fallback={
            <>
              <span class="working-text">{statusText()}</span>
              <Show when={elapsed() > 0}>
                <span class="working-elapsed">{formatElapsed()}</span>
              </Show>
            </>
          }
        >
          <div class="working-body">
            <div class="working-row">
              <span class="working-text working-text-wrap">{statusText()}</span>
              <Show when={elapsed() > 0}>
                <span class="working-elapsed">{formatElapsed()}</span>
              </Show>
            </div>
            <div class="working-actions">
              <IconButton
                icon={copied() === "message" ? "check-small" : "copy"}
                size="small"
                variant="ghost"
                aria-label={language.t("ui.permission.copyCommand")}
                onClick={() => copy(retryMsg() ?? statusText(), "message")}
              />
              <Show when={retryDetails()}>
                <Collapsible open={open()} onOpenChange={setOpen} variant="ghost">
                  <Collapsible.Trigger class="working-details-trigger">
                    <span>{language.t("error.details.show")}</span>
                    <Collapsible.Arrow />
                  </Collapsible.Trigger>
                  <Collapsible.Content>
                    <div class="working-details-box">
                      <div class="working-details-actions">
                        <IconButton
                          icon={copied() === "details" ? "check-small" : "copy"}
                          size="small"
                          variant="ghost"
                          aria-label={language.t("ui.permission.copyCommand")}
                          onClick={copyDetails}
                        />
                      </div>
                      <pre class="working-details-pre">{retryDetails()}</pre>
                    </div>
                  </Collapsible.Content>
                </Collapsible>
              </Show>
            </div>
          </div>
        </Show>
      </div>
    </Show>
  )
}
