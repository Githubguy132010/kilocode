/**
 * Source contract tests for prompt send paths.
 *
 * Static analysis — reads session.tsx source and verifies that sendMessage and
 * sendCommand still dismiss suggestions and reject questions before dispatching.
 * Protects against accidental removal during Kilo development.
 */

import { describe, it, expect } from "bun:test"
import fs from "node:fs"
import path from "node:path"

const ROOT = path.resolve(import.meta.dir, "../..")
const SESSION_FILE = path.join(ROOT, "webview-ui/src/context/session.tsx")

function readFile(filePath: string): string {
  return fs.readFileSync(filePath, "utf-8")
}

/**
 * Extract the body of a named function from the source.
 * Finds `function <name>(` and returns everything from there to the next
 * `function ` declaration at the same or lower indentation, or to end of file.
 */
function extractFunctionBody(source: string, name: string): string {
  const marker = `function ${name}(`
  const start = source.indexOf(marker)
  if (start === -1) return ""

  // Find the next `function ` declaration after the opening one.
  // We search for a newline followed by `  function ` (2-space indent, matching
  // the indentation level of sendMessage/sendCommand inside SessionProvider).
  const rest = source.slice(start + marker.length)
  const next = rest.search(/\n  function /)
  return next === -1 ? rest : rest.slice(0, next)
}

describe("sendMessage dismisses pending tool requests", () => {
  const source = readFile(SESSION_FILE)
  const body = extractFunctionBody(source, "sendMessage")

  it("function sendMessage exists in session.tsx", () => {
    expect(body.length).toBeGreaterThan(0)
  })

  it("dismisses suggestions before sending", () => {
    expect(body).toContain("dismissSuggestion")
  })

  it("rejects questions before sending", () => {
    expect(body).toContain("rejectQuestion")
  })
})

describe("sendCommand dismisses pending tool requests", () => {
  const source = readFile(SESSION_FILE)
  const body = extractFunctionBody(source, "sendCommand")

  it("function sendCommand exists in session.tsx", () => {
    expect(body.length).toBeGreaterThan(0)
  })

  it("dismisses suggestions before sending", () => {
    expect(body).toContain("dismissSuggestion")
  })

  it("rejects questions before sending", () => {
    expect(body).toContain("rejectQuestion")
  })
})
