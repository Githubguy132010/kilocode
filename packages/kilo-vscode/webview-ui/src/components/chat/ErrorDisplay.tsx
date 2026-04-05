import { Component, createMemo, Switch, Match } from "solid-js"
import { Card } from "@kilocode/kilo-ui/card"
import { Collapsible } from "@kilocode/kilo-ui/collapsible"
import { ErrorDetails } from "@kilocode/kilo-ui/error-details"
import { Button } from "@kilocode/kilo-ui/button"
import { showToast } from "@kilocode/kilo-ui/toast"
import type { AssistantMessage, Message, Part } from "@kilocode/sdk/v2"
import { useLanguage } from "../../context/language"
import { useServer } from "../../context/server"
import { buildBasicErrorInfo, buildDetailedErrorReport } from "../../utils/error-report"
import {
  unwrapError,
  parseAssistantError,
  isUnauthorizedPaidModelError,
  isUnauthorizedPromotionLimitError,
} from "../../utils/errorUtils"

interface ErrorDisplayProps {
  error: NonNullable<AssistantMessage["error"]>
  assistant?: AssistantMessage
  history: Message[]
  getParts: (id: string) => Part[]
  onLogin?: () => void
}

export const ErrorDisplay: Component<ErrorDisplayProps> = (props) => {
  const { t } = useLanguage()
  const server = useServer()
  const parsed = createMemo(() => parseAssistantError(props.error))

  const errorText = createMemo(() => {
    const msg = props.error.data?.message
    if (typeof msg === "string") return unwrapError(msg)
    if (msg === undefined || msg === null) return ""
    return unwrapError(String(msg))
  })

  const basic = createMemo(() =>
    buildBasicErrorInfo({
      error: props.error,
      assistant: props.assistant,
      history: props.history,
      getParts: props.getParts,
      version: server.extensionVersion(),
    }),
  )

  const report = createMemo(() =>
    buildDetailedErrorReport({
      error: props.error,
      assistant: props.assistant,
      history: props.history,
      getParts: props.getParts,
      version: server.extensionVersion(),
    }),
  )

  const copy = () => {
    void navigator.clipboard.writeText(basic()).then(() => {
      showToast({ variant: "success", title: t("deviceAuth.toast.errorCopied") })
    })
  }

  const download = () => {
    const blob = new Blob([report()], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `kilo-error-${Date.now()}.jsonc`
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <Switch
      fallback={
        <Card variant="error" class="error-card">
          {errorText()}
          <Collapsible variant="ghost">
            <Collapsible.Trigger class="error-details-trigger">
              <span>{t("error.details.show")}</span>
              <Collapsible.Arrow />
            </Collapsible.Trigger>
            <Collapsible.Content>
              <div class="error-details-actions">
                <Button variant="secondary" size="small" onClick={copy}>
                  Copy basic error info
                </Button>
                <Button variant="secondary" size="small" onClick={download}>
                  Get detailed error info
                </Button>
              </div>
              <ErrorDetails error={props.error} />
            </Collapsible.Content>
          </Collapsible>
        </Card>
      }
    >
      <Match when={isUnauthorizedPaidModelError(parsed())}>
        <div data-component="auth-prompt">
          <div data-slot="auth-prompt-header">
            <span data-slot="auth-prompt-icon">✨</span>
            <span data-slot="auth-prompt-title">{t("error.paidModel.title")}</span>
          </div>
          <p data-slot="auth-prompt-description">{t("error.paidModel.description")}</p>
          <Button variant="primary" onClick={() => props.onLogin?.()}>
            {t("error.paidModel.action")}
          </Button>
        </div>
      </Match>
      <Match when={isUnauthorizedPromotionLimitError(parsed())}>
        <div data-component="auth-prompt">
          <div data-slot="auth-prompt-header">
            <span data-slot="auth-prompt-icon">🕙</span>
            <span data-slot="auth-prompt-title">{t("error.promotionLimit.title")}</span>
          </div>
          <p data-slot="auth-prompt-description">{t("error.promotionLimit.description")}</p>
          <Button variant="primary" onClick={() => props.onLogin?.()}>
            {t("error.promotionLimit.action")}
          </Button>
        </div>
      </Match>
    </Switch>
  )
}
