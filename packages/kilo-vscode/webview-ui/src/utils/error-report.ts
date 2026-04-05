import type { AssistantMessage, Message, Part } from "@kilocode/sdk/v2"
import { unwrapError } from "./errorUtils"

type ErrorType = NonNullable<AssistantMessage["error"]>

interface ReportInput {
  error: ErrorType
  assistant?: AssistantMessage
  history: Message[]
  getParts: (id: string) => Part[]
  version?: string
}

function stamp(msg?: Message | AssistantMessage) {
  const ts = msg?.time?.completed ?? msg?.time?.created
  if (typeof ts === "number" && Number.isFinite(ts)) return new Date(ts).toISOString()
  if (msg?.createdAt) return msg.createdAt
  return new Date().toISOString()
}

function text(error: ErrorType) {
  const msg = error.data?.message
  if (typeof msg === "string") return unwrapError(msg)
  if (msg === undefined || msg === null) return error.name
  return unwrapError(String(msg))
}

function provider(msg?: AssistantMessage) {
  return msg?.model?.providerID ?? msg?.providerID ?? "unknown"
}

function model(msg?: AssistantMessage) {
  return msg?.model?.modelID ?? msg?.modelID ?? "unknown"
}

function content(msg: Message, getParts: (id: string) => Part[]) {
  const parts = getParts(msg.id)
  if (parts.length > 0) {
    return parts.flatMap((part) => {
      if (part.type === "text" || part.type === "reasoning") {
        return [{ type: "text", text: part.text }]
      }
      if (part.type === "tool") {
        return [
          {
            type: "tool",
            tool: part.tool,
            state: part.state,
          },
        ]
      }
      if (part.type === "file") {
        return [
          {
            type: "file",
            mime: part.mime,
            filename: part.filename,
          },
        ]
      }
      return []
    })
  }
  if (typeof msg.content === "string" && msg.content.length > 0) {
    return [{ type: "text", text: msg.content }]
  }
  return []
}

export function buildBasicErrorInfo(input: ReportInput) {
  return [
    `Date/time: ${stamp(input.assistant)}`,
    `Extension version: ${input.version ?? "unknown"}`,
    `Provider: ${provider(input.assistant)}`,
    `Model: ${model(input.assistant)}`,
    "",
    text(input.error),
  ].join("\n")
}

export function buildDetailedErrorReport(input: ReportInput) {
  const report = {
    error: {
      timestamp: stamp(input.assistant),
      version: input.version ?? "unknown",
      provider: provider(input.assistant),
      model: model(input.assistant),
      details: text(input.error),
      raw: input.error,
    },
    history: input.history.map((msg) => ({
      role: msg.role,
      content: content(msg, input.getParts),
      ts: msg.time?.created ?? Date.parse(stamp(msg)),
    })),
  }

  return [
    "// Please share this file with Kilo Code Support (support@kilo.ai) to diagnose the issue faster",
    "// Just make sure you're OK sharing the contents of the conversation below.",
    "",
    JSON.stringify(report, null, 2),
  ].join("\n")
}
