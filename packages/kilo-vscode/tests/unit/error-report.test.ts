import { describe, expect, it } from "bun:test"
import fs from "node:fs"
import path from "node:path"
import type { AssistantMessage, Message } from "@kilocode/sdk/v2"
import { buildBasicErrorInfo, buildDetailedErrorReport } from "../../webview-ui/src/utils/error-report"

const root = path.resolve(import.meta.dir, "../..")
const display = path.join(root, "webview-ui/src/components/chat/ErrorDisplay.tsx")

describe("error report helpers", () => {
  const error = {
    name: "APIError",
    data: {
      message: "OpenAI completion error: Connection error.",
      statusCode: 500,
    },
  } as NonNullable<AssistantMessage["error"]>

  const user = {
    id: "m1",
    role: "user",
    content: "<task>\nHello\n</task>",
    createdAt: "2026-04-05T08:00:37.238Z",
    sessionID: "s1",
    time: { created: 1775376037362 },
  } as Message

  const assistant = {
    id: "m2",
    role: "assistant",
    createdAt: "2026-04-05T08:00:41.928Z",
    sessionID: "s1",
    time: { created: 1775376041928 },
    model: { providerID: "openai", modelID: "coder-model" },
    error,
  } as AssistantMessage

  it("formats basic error info", () => {
    const text = buildBasicErrorInfo({
      error,
      assistant,
      history: [user, assistant],
      getParts: () => [],
      version: "5.12.0",
    })

    expect(text).toContain("Date/time: 2026-04-05T08:00:41.928Z")
    expect(text).toContain("Extension version: 5.12.0")
    expect(text).toContain("Provider: openai")
    expect(text).toContain("Model: coder-model")
    expect(text).toContain("OpenAI completion error: Connection error.")
  })

  it("formats detailed error report with raw error and history", () => {
    const text = buildDetailedErrorReport({
      error,
      assistant,
      history: [user, assistant],
      getParts: () => [],
      version: "5.12.0",
    })

    expect(text).toContain("support@kilo.ai")
    expect(text).toContain('"version": "5.12.0"')
    expect(text).toContain('"provider": "openai"')
    expect(text).toContain('"model": "coder-model"')
    expect(text).toContain('"details": "OpenAI completion error: Connection error."')
    expect(text).toContain('"role": "user"')
    expect(text).toContain("<task>\\nHello\\n</task>")
    expect(text).toContain('"raw"')
  })
})

describe("ErrorDisplay retry diagnostics UI", () => {
  it("renders the follow-up buttons in the component source", () => {
    const src = fs.readFileSync(display, "utf-8")

    expect(src).toContain("Copy basic error info")
    expect(src).toContain("Get detailed error info")
    expect(src).toContain("buildBasicErrorInfo")
    expect(src).toContain("buildDetailedErrorReport")
  })
})
