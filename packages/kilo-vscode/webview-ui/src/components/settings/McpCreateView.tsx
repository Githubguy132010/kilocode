import { Card } from "@kilocode/kilo-ui/card"
import { Button } from "@kilocode/kilo-ui/button"
import { IconButton } from "@kilocode/kilo-ui/icon-button"
import { RadioGroup } from "@kilocode/kilo-ui/radio-group"
import { TextField } from "@kilocode/kilo-ui/text-field"
import { showToast } from "@kilocode/kilo-ui/toast"
import { Select } from "@kilocode/kilo-ui/select"
import { For, Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js"
import type { Component } from "solid-js"

import { useLanguage } from "../../context/language"
import { useServer } from "../../context/server"
import { useVSCode } from "../../context/vscode"
import type { McpConfig } from "../../types/messages"
import SettingsRow from "./SettingsRow"

interface Props {
  taken: string[]
  onBack: () => void
}

type Scope = "project" | "global"
type Kind = "local" | "remote"
type OAuth = "auto" | "disabled"

const McpCreateView: Component<Props> = (props) => {
  const language = useLanguage()
  const server = useServer()
  const vscode = useVSCode()

  const [name, setName] = createSignal("")
  const [scope, setScope] = createSignal<Scope>(server.workspaceDirectory() ? "project" : "global")
  const [kind, setKind] = createSignal<Kind>("local")
  const [command, setCommand] = createSignal("")
  const [args, setArgs] = createSignal("")
  const [url, setUrl] = createSignal("")
  const [timeout, setTimeout] = createSignal("")
  const [oauth, setOauth] = createSignal<OAuth>("auto")
  const [env, setEnv] = createSignal<Record<string, string>>({})
  const [headers, setHeaders] = createSignal<Record<string, string>>({})
  const [envKey, setEnvKey] = createSignal("")
  const [envVal, setEnvVal] = createSignal("")
  const [headerKey, setHeaderKey] = createSignal("")
  const [headerVal, setHeaderVal] = createSignal("")
  const [error, setError] = createSignal("")
  const [pending, setPending] = createSignal("")

  const scopeOpts = createMemo<Scope[]>(() => (server.workspaceDirectory() ? ["project", "global"] : ["global"]))
  const oauthOpts = createMemo(() => [
    { value: "auto" as const, label: language.t("settings.agentBehaviour.editMcp.oauth.auto") },
    { value: "disabled" as const, label: language.t("settings.agentBehaviour.editMcp.oauth.disabled") },
  ])

  createEffect(() => {
    if (!server.workspaceDirectory() && scope() === "project") {
      setScope("global")
    }
  })

  const unsub = vscode.onMessage((msg) => {
    if (msg.type !== "addMcpResult") return
    if (msg.name !== pending()) return
    setPending("")
    if (msg.success) {
      reset()
      props.onBack()
      return
    }
    const text = msg.error ?? language.t("common.requestFailed")
    setError(text)
    showToast({
      variant: "error",
      title: language.t("common.requestFailed"),
      description: text,
    })
  })
  onCleanup(unsub)

  const envList = createMemo(() => Object.entries(env()))
  const headerList = createMemo(() => Object.entries(headers()))

  const validate = (slug: string) => {
    if (!slug) return language.t("settings.agentBehaviour.addMcp.nameRequired")
    if (!/^[a-z][a-z0-9-]*$/.test(slug)) return language.t("settings.agentBehaviour.addMcp.nameInvalid")
    if (props.taken.includes(slug)) return language.t("settings.agentBehaviour.addMcp.nameTaken")
    if (kind() === "local" && !command().trim()) return language.t("settings.agentBehaviour.addMcp.command")
    if (kind() === "remote" && !url().trim()) return language.t("settings.agentBehaviour.addMcp.url")
    const ms = parseTimeout(timeout())
    if (timeout().trim() && ms === undefined) {
      return language.t("settings.agentBehaviour.editMcp.timeout.description")
    }
    return ""
  }

  const parseTimeout = (value: string) => {
    const text = value.trim()
    if (!text) return undefined
    const ms = Number.parseInt(text, 10)
    if (!Number.isFinite(ms) || ms <= 0) return undefined
    return ms
  }

  const reset = () => {
    setName("")
    setScope(server.workspaceDirectory() ? "project" : "global")
    setKind("local")
    setCommand("")
    setArgs("")
    setUrl("")
    setTimeout("")
    setOauth("auto")
    setEnv({})
    setHeaders({})
    setEnvKey("")
    setEnvVal("")
    setHeaderKey("")
    setHeaderVal("")
    setError("")
    setPending("")
  }

  const cancel = () => {
    reset()
    props.onBack()
  }

  const addEnv = () => {
    const key = envKey().trim()
    if (!key) return
    setEnv((prev) => ({ ...prev, [key]: envVal().trim() }))
    setEnvKey("")
    setEnvVal("")
  }

  const removeEnv = (key: string) => {
    setEnv((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  const addHeader = () => {
    const key = headerKey().trim()
    if (!key) return
    setHeaders((prev) => ({ ...prev, [key]: headerVal().trim() }))
    setHeaderKey("")
    setHeaderVal("")
  }

  const removeHeader = (key: string) => {
    setHeaders((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  const submit = () => {
    const slug = name().trim()
    const msg = validate(slug)
    if (msg) {
      setError(msg)
      return
    }

    const ms = parseTimeout(timeout())
    const cfg: McpConfig =
      kind() === "local"
        ? {
            type: "local",
            command: [
              command().trim(),
              ...args()
                .split(/\n/)
                .map((x) => x.trim())
                .filter(Boolean),
            ],
            environment: envList().length > 0 ? env() : undefined,
            timeout: ms,
          }
        : {
            type: "remote",
            url: url().trim(),
            headers: headerList().length > 0 ? headers() : undefined,
            oauth: oauth() === "disabled" ? false : undefined,
            timeout: ms,
          }

    setError("")
    setPending(slug)
    vscode.postMessage({
      type: "addMcp",
      name: slug,
      config: cfg,
      scope: scope(),
    })
  }

  return (
    <div>
      <div style={{ display: "flex", "align-items": "center", "margin-bottom": "16px" }}>
        <IconButton size="small" variant="ghost" icon="arrow-left" onClick={cancel} />
        <span style={{ "font-weight": "600", "font-size": "14px", "margin-left": "8px" }}>
          {language.t("settings.agentBehaviour.addMcp.title")}
        </span>
      </div>

      <Card data-variant="wide-input" style={{ "margin-bottom": "12px" }}>
        <SettingsRow
          title={language.t("settings.agentBehaviour.addMcp.name")}
          description={language.t("settings.agentBehaviour.addMcp.name.description")}
        >
          <TextField
            value={name()}
            placeholder={language.t("settings.agentBehaviour.addMcp.name.placeholder")}
            onChange={(value) => {
              setName(value)
              setError("")
            }}
          />
          <Show when={error()}>
            <div
              style={{
                "font-size": "11px",
                color: "var(--vscode-errorForeground)",
                "margin-top": "4px",
              }}
            >
              {error()}
            </div>
          </Show>
        </SettingsRow>

        <SettingsRow
          title={language.t("settings.agentBehaviour.addMcp.scope")}
          description={language.t("settings.agentBehaviour.addMcp.scope.description")}
        >
          <RadioGroup
            options={scopeOpts()}
            current={scope()}
            value={(value) => value}
            label={(value) => language.t(`settings.agentBehaviour.addMcp.scope.${value}`)}
            onSelect={(value) => value && setScope(value)}
            size="small"
          />
        </SettingsRow>

        <SettingsRow
          title={language.t("settings.agentBehaviour.addMcp.type")}
          description={language.t("settings.agentBehaviour.addMcp.type.description")}
          last
        >
          <RadioGroup
            options={["local", "remote"] as const}
            current={kind()}
            value={(value) => value}
            label={(value) => language.t(`settings.agentBehaviour.addMcp.type.${value}`)}
            onSelect={(value) => value && setKind(value)}
            size="small"
          />
        </SettingsRow>
      </Card>

      <Show when={kind() === "local"}>
        <Card style={{ "margin-bottom": "12px" }}>
          <div data-slot="settings-row-label-title" style={{ "margin-bottom": "8px" }}>
            {language.t("settings.agentBehaviour.addMcp.command")}
          </div>
          <TextField
            value={command()}
            placeholder={language.t("settings.agentBehaviour.addMcp.command.placeholder")}
            onChange={setCommand}
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
            onChange={setArgs}
          />
        </Card>

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
              "border-bottom": envList().length > 0 ? "1px solid var(--border-weak-base)" : "none",
            }}
          >
            <div style={{ flex: 1 }}>
              <TextField value={envKey()} placeholder="KEY" onChange={setEnvKey} />
            </div>
            <div style={{ flex: 1 }}>
              <TextField
                value={envVal()}
                placeholder="value"
                onChange={setEnvVal}
                onKeyDown={(event: KeyboardEvent) => {
                  if (event.key === "Enter") addEnv()
                }}
              />
            </div>
            <Button variant="secondary" onClick={addEnv}>
              {language.t("common.add")}
            </Button>
          </div>

          <For each={envList()}>
            {([key, value], index) => (
              <div
                style={{
                  display: "flex",
                  "align-items": "center",
                  "justify-content": "space-between",
                  padding: "6px 0",
                  "border-bottom": index() < envList().length - 1 ? "1px solid var(--border-weak-base)" : "none",
                }}
              >
                <span style={{ "font-family": "var(--vscode-editor-font-family, monospace)", "font-size": "12px" }}>
                  {key}={value}
                </span>
                <IconButton size="small" variant="ghost" icon="close" onClick={() => removeEnv(key)} />
              </div>
            )}
          </For>
        </Card>
      </Show>

      <Show when={kind() === "remote"}>
        <Card style={{ "margin-bottom": "12px" }}>
          <div data-slot="settings-row-label-title" style={{ "margin-bottom": "8px" }}>
            {language.t("settings.agentBehaviour.addMcp.url")}
          </div>
          <TextField
            value={url()}
            placeholder={language.t("settings.agentBehaviour.addMcp.url.placeholder")}
            onChange={setUrl}
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
              "border-bottom": headerList().length > 0 ? "1px solid var(--border-weak-base)" : "none",
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
                onKeyDown={(event: KeyboardEvent) => {
                  if (event.key === "Enter") addHeader()
                }}
              />
            </div>
            <Button variant="secondary" onClick={addHeader}>
              {language.t("common.add")}
            </Button>
          </div>

          <For each={headerList()}>
            {([key, value], index) => (
              <div
                style={{
                  display: "flex",
                  "align-items": "center",
                  "justify-content": "space-between",
                  padding: "6px 0",
                  "border-bottom": index() < headerList().length - 1 ? "1px solid var(--border-weak-base)" : "none",
                }}
              >
                <span style={{ "font-family": "var(--vscode-editor-font-family, monospace)", "font-size": "12px" }}>
                  {key}: {value}
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
            current={oauthOpts().find((opt) => opt.value === oauth())}
            value={(opt) => opt.value}
            label={(opt) => opt.label}
            onSelect={(opt) => opt && setOauth(opt.value)}
            variant="secondary"
            size="small"
          />
        </Card>
      </Show>

      <Card style={{ "margin-bottom": "12px" }}>
        <div data-slot="settings-row-label-title" style={{ "margin-bottom": "4px" }}>
          {language.t("settings.agentBehaviour.editMcp.timeout")}
        </div>
        <div data-slot="settings-row-label-subtitle" style={{ "margin-bottom": "8px" }}>
          {language.t("settings.agentBehaviour.editMcp.timeout.description")}
        </div>
        <TextField
          type="number"
          value={timeout()}
          placeholder={language.t("settings.agentBehaviour.editMcp.timeout.placeholder")}
          onChange={setTimeout}
        />
      </Card>

      <div style={{ display: "flex", gap: "8px", "justify-content": "flex-end" }}>
        <Button variant="ghost" onClick={cancel}>
          {language.t("settings.agentBehaviour.addMcp.cancel")}
        </Button>
        <Button variant="primary" onClick={submit}>
          {language.t("settings.agentBehaviour.addMcp.button")}
        </Button>
      </div>
    </div>
  )
}

export default McpCreateView
