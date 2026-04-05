import { Component, createMemo, createSignal, Switch, Match } from "solid-js"
import { Card } from "@kilocode/kilo-ui/card"
import { Collapsible } from "@kilocode/kilo-ui/collapsible"
import { IconButton } from "@kilocode/kilo-ui/icon-button"
import { Button } from "@kilocode/kilo-ui/button"
import { showToast } from "@kilocode/kilo-ui/toast"
import type { AssistantMessage } from "@kilocode/sdk/v2"
import { useLanguage } from "../../context/language"
import {
  unwrapError,
  parseAssistantError,
  isUnauthorizedPaidModelError,
  isUnauthorizedPromotionLimitError,
} from "../../utils/errorUtils"

interface ErrorDisplayProps {
  error: NonNullable<AssistantMessage["error"]>
  onLogin?: () => void
}

export const ErrorDisplay: Component<ErrorDisplayProps> = (props) => {
  const { t } = useLanguage()
  const parsed = createMemo(() => parseAssistantError(props.error))
  const [copied, setCopied] = createSignal<"message" | "details">()

  const errorText = createMemo(() => {
    const msg = props.error.data?.message
    if (typeof msg === "string") return unwrapError(msg)
    if (msg === undefined || msg === null) return ""
    return unwrapError(String(msg))
  })

  const copy = (text: string, kind: "message" | "details") => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(kind)
      showToast({ variant: "success", title: t("deviceAuth.toast.errorCopied") })
      setTimeout(() => setCopied(undefined), 2000)
    })
  }

  return (
    <Switch
      fallback={
        <Card variant="error" class="error-card">
          <div class="error-card-header">
            <span class="error-card-message">{errorText()}</span>
            <IconButton
              icon={copied() === "message" ? "check-small" : "copy"}
              size="small"
              variant="ghost"
              aria-label={t("ui.permission.copyCommand")}
              onClick={() => copy(errorText(), "message")}
            />
          </div>
          <Collapsible variant="ghost">
            <Collapsible.Trigger class="error-details-trigger">
              <span>{t("error.details.show")}</span>
              <Collapsible.Arrow />
            </Collapsible.Trigger>
            <Collapsible.Content>
              <div class="error-details">
                <div class="error-details-actions">
                  <IconButton
                    icon={copied() === "details" ? "check-small" : "copy"}
                    size="small"
                    variant="ghost"
                    aria-label={t("ui.permission.copyCommand")}
                    onClick={() => copy(JSON.stringify(props.error, null, 2), "details")}
                  />
                </div>
                <pre class="error-detail-pre">{JSON.stringify(props.error, null, 2)}</pre>
              </div>
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
