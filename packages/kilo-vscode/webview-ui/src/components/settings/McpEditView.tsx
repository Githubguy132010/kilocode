import { Show, createEffect, createMemo, createSignal, For } from "solid-js"
import type { Component } from "solid-js"
import { Switch } from "@kilocode/kilo-ui/switch"
import { TextField } from "@kilocode/kilo-ui/text-field"
import { Card } from "@kilocode/kilo-ui/card"
import { Button } from "@kilocode/kilo-ui/button"
import { IconButton } from "@kilocode/kilo-ui/icon-button"
import { Select } from "@kilocode/kilo-ui/select"

import { useConfig } from "../../context/config"
import { useLanguage } from "../../context/language"
import type { McpConfig } from "../../types/messages"
import SettingsRow from "./SettingsRow"

interface Props {
  name: string
  onBack: () => void
  onRemove: (name: string) => void
}

const McpEditView: Component<Props> = (props) => {
  const language = useLanguage()
  const { config, updateConfig } = useConfig()

  const cfg = createMemo<McpConfig>(() => config().mcp?.[props.name] ?? {})

  const [envKey, setEnvKey] = createSignal("")
  const [envVal, setEnvVal] = createSignal("")
  const [headerKey, setHeaderKey] = createSignal("")
  const [headerVal, setHeaderVal] = createSignal("")
  const [oauthCfg, setOauthCfg] = createSignal<McpConfig["oauth"]>(undefined)

  createEffect(() => {
    const oauth = cfg().oauth
    if (oauth && typeof oauth === "object") {
      setOauthCfg(oauth)
    }
  })

  const update = (partial: Partial<McpConfig>) => {
    const existing = config().mcp ?? {}
    const current = existing[props.name] ?? {}
    updateConfig({
      mcp: { ...existing, [props.name]: { ...current, ...partial } },
    })
  }

  const transport = () => cfg().type ?? (cfg().url ? "remote" : "local")

  const cmd = () => {
    const c = cfg().command
    if (Array.isArray(c)) return c[0] ?? ""
    return c ?? ""
  }

  const args = () => {
    const c = cfg().command
    if (Array.isArray(c)) return c.slice(1).join("\n")
    return (cfg().args ?? []).join("\n")
  }

  const env = createMemo(() => Object.entries(cfg().environment ?? cfg().env ?? {}))
  const headers = createMemo(() => Object.entries(cfg().headers ?? {}))
  const oauthOpts = createMemo(() => [
    { value: "auto" as const, label: language.t("settings.agentBehaviour.editMcp.oauth.auto") },
    { value: "disabled" as const, label: language.t("settings.agentBehaviour.editMcp.oauth.disabled") },
  ])

  const addEnv = () => {
    const key = envKey().trim()
    const val = envVal().trim()
    if (!key) return
    const existing = cfg().environment ?? cfg().env ?? {}
    update({ environment: { ...existing, [key]: val } })
    setEnvKey("")
    setEnvVal("")
  }

  const removeEnv = (key: string) => {
    const existing = { ...(cfg().environment ?? cfg().env ?? {}) }
    delete existing[key]
    update({ environment: existing })
  }

  const addHeader = () => {
    const key = headerKey().trim()
    const val = headerVal().trim()
    if (!key) return
    update({ headers: { ...(cfg().headers ?? {}), [key]: val } })
    setHeaderKey("")
    setHeaderVal("")
  }

  const removeHeader = (key: string) => {
    const existing = { ...(cfg().headers ?? {}) }
    delete existing[key]
    update({ headers: existing })
  }

  const setTimeout = (value: string) => {
    const text = value.trim()
    if (!text) {
      update({ timeout: undefined })
      return
    }
    const ms = Number.parseInt(text, 10)
    update({ timeout: Number.isFinite(ms) && ms > 0 ? ms : undefined })
  }

  return (
    <div>
      <div
        style={{
          display: "flex",
          "align-items": "center",
          "justify-content": "space-between",
          "margin-bottom": "16px",
        }}
      >
        <div style={{ display: "flex", "align-items": "center" }}>
          <IconButton size="small" variant="ghost" icon="arrow-left" onClick={props.onBack} />
          <span style={{ "font-weight": "600", "font-size": "14px", "margin-left": "8px" }}>
            {language.t("settings.agentBehaviour.editMcp")} — {props.name}
          </span>
        </div>
        <IconButton size="small" variant="ghost" icon="close" onClick={() => props.onRemove(props.name)} />
      </div>

      {/* Transport info */}
      <Card style={{ "margin-bottom": "12px" }}>
        <div
          style={{
            "font-size": "12px",
            color: "var(--text-weak-base, var(--vscode-descriptionForeground))",
            padding: "4px 0",
          }}
        >
          {transport() === "local"
            ? language.t("settings.agentBehaviour.editMcp.transportLocal")
            : language.t("settings.agentBehaviour.editMcp.transportRemote")}
        </div>
      </Card>

      <Card data-variant="wide-input" style={{ "margin-bottom": "12px" }}>
        <SettingsRow
          title={language.t("settings.agentBehaviour.editMcp.enabled")}
          description={language.t("settings.agentBehaviour.editMcp.enabled.description")}
          last
        >
          <Switch
            checked={cfg().enabled ?? true}
            onChange={(value) => update({ enabled: value ? undefined : false })}
            hideLabel
          >
            {language.t("settings.agentBehaviour.editMcp.enabled")}
          </Switch>
        </SettingsRow>
      </Card>

      <Card style={{ "margin-bottom": "12px" }}>
        <div data-slot="settings-row-label-title" style={{ "margin-bottom": "4px" }}>
          {language.t("settings.agentBehaviour.editMcp.timeout")}
        </div>
        <div data-slot="settings-row-label-subtitle" style={{ "margin-bottom": "8px" }}>
          {language.t("settings.agentBehaviour.editMcp.timeout.description")}
        </div>
        <TextField
          type="number"
          value={cfg().timeout?.toString() ?? ""}
          placeholder={language.t("settings.agentBehaviour.editMcp.timeout.placeholder")}
          onChange={setTimeout}
        />
      </Card>

      {/* Command / URL */}
      <Show when={transport() === "local"}>
        <Card style={{ "margin-bottom": "12px" }}>
          <div data-slot="settings-row-label-title" style={{ "margin-bottom": "8px" }}>
            {language.t("settings.agentBehaviour.addMcp.command")}
          </div>
          <TextField
            value={cmd()}
            placeholder={language.t("settings.agentBehaviour.addMcp.command.placeholder")}
            onChange={(val) => {
              const existing = cfg().command
              const rest = Array.isArray(existing) ? existing.slice(1) : (cfg().args ?? [])
              update({ command: [val.trim(), ...rest] })
            }}
          />
        </Card>
        <Card style={{ "margin-bottom": "12px" }}>
          <div data-slot="settings-row-label-title" style={{ "margin-bottom": "4px" }}>
            {language.t("settings.agentBehaviour.addMcp.args")}
          </div>
          <div data-slot="settings-row-label-subtitle" style={{ "margin-bottom": "8px" }}>
            {language.t("settings.agentBehaviour.addMcp.args.help")}
          </div>
          <TextField
            value={args()}
            placeholder={language.t("settings.agentBehaviour.addMcp.args.placeholder")}
            multiline
            onChange={(val) => {
              const parts = val.split(/\n/).filter(Boolean)
              update({ command: [cmd(), ...parts] })
            }}
          />
        </Card>
      </Show>

      <Show when={transport() === "remote"}>
        <Card style={{ "margin-bottom": "12px" }}>
          <div data-slot="settings-row-label-title" style={{ "margin-bottom": "8px" }}>
            {language.t("settings.agentBehaviour.addMcp.url")}
          </div>
          <TextField
            value={cfg().url ?? ""}
            placeholder={language.t("settings.agentBehaviour.addMcp.url.placeholder")}
            onChange={(val) => update({ url: val.trim() || undefined })}
          />
        </Card>

        <Card style={{ "margin-bottom": "12px" }}>
          <div data-slot="settings-row-label-title" style={{ "margin-bottom": "4px" }}>
            {language.t("settings.agentBehaviour.editMcp.headers")}
          </div>
          <div data-slot="settings-row-label-subtitle" style={{ "margin-bottom": "8px" }}>
            {language.t("settings.agentBehaviour.editMcp.headers.help")}
          </div>

          <div
            style={{
              display: "flex",
              gap: "8px",
              "align-items": "center",
              padding: "8px 0",
              "border-bottom": headers().length > 0 ? "1px solid var(--border-weak-base)" : "none",
            }}
          >
            <div style={{ flex: 1 }}>
              <TextField value={headerKey()} placeholder="Header-Name" onChange={setHeaderKey} />
            </div>
            <div style={{ flex: 1 }}>
              <TextField
                value={headerVal()}
                placeholder="value"
                onChange={setHeaderVal}
                onKeyDown={(e: KeyboardEvent) => {
                  if (e.key === "Enter") addHeader()
                }}
              />
            </div>
            <Button variant="secondary" onClick={addHeader}>
              {language.t("common.add")}
            </Button>
          </div>

          <For each={headers()}>
            {([key, val], index) => (
              <div
                style={{
                  display: "flex",
                  "align-items": "center",
                  "justify-content": "space-between",
                  padding: "6px 0",
                  "border-bottom": index() < headers().length - 1 ? "1px solid var(--border-weak-base)" : "none",
                }}
              >
                <span
                  style={{
                    "font-family": "var(--vscode-editor-font-family, monospace)",
                    "font-size": "12px",
                  }}
                >
                  {key}: {val}
                </span>
                <IconButton size="small" variant="ghost" icon="close" onClick={() => removeHeader(key)} />
              </div>
            )}
          </For>
        </Card>

        <Card style={{ "margin-bottom": "12px" }}>
          <div data-slot="settings-row-label-title" style={{ "margin-bottom": "4px" }}>
            {language.t("settings.agentBehaviour.editMcp.oauth")}
          </div>
          <div data-slot="settings-row-label-subtitle" style={{ "margin-bottom": "8px" }}>
            {language.t("settings.agentBehaviour.editMcp.oauth.help")}
          </div>
          <Select
            options={oauthOpts()}
            current={oauthOpts().find((opt) => opt.value === (cfg().oauth === false ? "disabled" : "auto"))}
            value={(opt) => opt.value}
            label={(opt) => opt.label}
            onSelect={(opt) => {
              if (!opt) return
              update({ oauth: opt.value === "disabled" ? false : oauthCfg() })
            }}
            variant="secondary"
            size="small"
          />
        </Card>
      </Show>

      {/* Environment variables (local servers only) */}
      <Show when={transport() === "local"}>
        <Card style={{ "margin-bottom": "12px" }}>
          <div data-slot="settings-row-label-title" style={{ "margin-bottom": "4px" }}>
            {language.t("settings.agentBehaviour.editMcp.env")}
          </div>
          <div data-slot="settings-row-label-subtitle" style={{ "margin-bottom": "8px" }}>
            {language.t("settings.agentBehaviour.editMcp.env.help")}
          </div>

          <div
            style={{
              display: "flex",
              gap: "8px",
              "align-items": "center",
              padding: "8px 0",
              "border-bottom": env().length > 0 ? "1px solid var(--border-weak-base)" : "none",
            }}
          >
            <div style={{ flex: 1 }}>
              <TextField value={envKey()} placeholder="KEY" onChange={(val) => setEnvKey(val)} />
            </div>
            <div style={{ flex: 1 }}>
              <TextField
                value={envVal()}
                placeholder="value"
                onChange={(val) => setEnvVal(val)}
                onKeyDown={(e: KeyboardEvent) => {
                  if (e.key === "Enter") addEnv()
                }}
              />
            </div>
            <Button variant="secondary" onClick={addEnv}>
              {language.t("common.add")}
            </Button>
          </div>

          <For each={env()}>
            {([key, val], index) => (
              <div
                style={{
                  display: "flex",
                  "align-items": "center",
                  "justify-content": "space-between",
                  padding: "6px 0",
                  "border-bottom": index() < env().length - 1 ? "1px solid var(--border-weak-base)" : "none",
                }}
              >
                <span
                  style={{
                    "font-family": "var(--vscode-editor-font-family, monospace)",
                    "font-size": "12px",
                  }}
                >
                  {key}={val}
                </span>
                <IconButton size="small" variant="ghost" icon="close" onClick={() => removeEnv(key)} />
              </div>
            )}
          </For>
        </Card>
      </Show>

      <div style={{ display: "flex", "justify-content": "flex-end" }}>
        <Button variant="ghost" onClick={props.onBack}>
          {language.t("settings.agentBehaviour.editMode.back")}
        </Button>
      </div>
    </div>
  )
}

export default McpEditView
