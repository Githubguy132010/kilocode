import { describe, expect, it } from "bun:test"
import fs from "node:fs"
import path from "node:path"

const root = path.resolve(import.meta.dir, "../..")
const tsx = path.join(root, "webview-ui/src/components/shared/WorkingIndicator.tsx")
const css = path.join(root, "webview-ui/src/styles/chat.css")

describe("WorkingIndicator retry UX", () => {
  it("applies retry-specific wrap and details controls in the component", () => {
    const src = fs.readFileSync(tsx, "utf-8")

    expect(src).toContain('const retry = () => session.statusInfo().type === "retry"')
    expect(src).toContain('"working-indicator-wrap": retry()')
    expect(src).toContain('class="working-text working-text-wrap"')
    expect(src).toContain("const retryDetails = () => {")
    expect(src).toContain('<Collapsible.Trigger class="working-details-trigger">')
    expect(src).toContain('onClick={() => copy(retryMsg() ?? statusText(), "message")}')
    expect(src).toContain("const copyDetails = () => {")
    expect(src).toContain("onClick={copyDetails}")
  })

  it("defines wrapping and details styles for retry text", () => {
    const src = fs.readFileSync(css, "utf-8")

    const wrap = src.match(/\.working-text-wrap\s*\{[^}]+\}/)?.[0]
    const row = src.match(/\.working-indicator-wrap\s*\{[^}]+\}/)?.[0]
    const box = src.match(/\.working-details-box\s*\{[^}]+\}/)?.[0]
    const pre = src.match(/\.working-details-pre\s*\{[^}]+\}/)?.[0]

    expect(wrap).toContain("white-space: normal;")
    expect(wrap).toContain("overflow-wrap: anywhere;")
    expect(row).toContain("align-items: flex-start;")
    expect(box).toContain("border-radius: 6px;")
    expect(pre).toContain("white-space: pre-wrap;")
  })
})
