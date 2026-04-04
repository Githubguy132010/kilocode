import { describe, expect, it } from "bun:test"
import fs from "node:fs"
import path from "node:path"

const root = path.resolve(import.meta.dir, "../..")
const tsx = path.join(root, "webview-ui/src/components/shared/WorkingIndicator.tsx")
const css = path.join(root, "webview-ui/src/styles/chat.css")

describe("WorkingIndicator retry wrapping", () => {
  it("applies retry-specific wrap classes in the component", () => {
    const src = fs.readFileSync(tsx, "utf-8")

    expect(src).toContain('const retry = () => session.statusInfo().type === "retry"')
    expect(src).toContain('"working-indicator-wrap": retry()')
    expect(src).toContain('"working-text-wrap": retry()')
  })

  it("defines wrapping styles for retry text", () => {
    const src = fs.readFileSync(css, "utf-8")

    const wrap = src.match(/\.working-text-wrap\s*\{[^}]+\}/)?.[0]
    const row = src.match(/\.working-indicator-wrap\s*\{[^}]+\}/)?.[0]

    expect(wrap).toContain("white-space: normal;")
    expect(wrap).toContain("overflow-wrap: anywhere;")
    expect(row).toContain("align-items: flex-start;")
  })
})
