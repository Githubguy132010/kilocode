/**
 * Contract test for prompt.ts Kilo-specific invariants.
 *
 * prompt.ts is a shared upstream file. PR #8988 added Suggestion.dismissAll
 * there with kilocode_change markers. An upstream merge that restructures
 * the prompt handling could silently remove this call — this test catches that.
 */

import { describe, test, expect } from "bun:test"
import fs from "node:fs"
import path from "node:path"

const PROMPT_FILE = path.resolve(import.meta.dir, "../../src/session/prompt.ts")

describe("prompt.ts Kilo-specific invariants", () => {
  test("imports Suggestion from kilocode/suggestion", () => {
    const content = fs.readFileSync(PROMPT_FILE, "utf-8")
    expect(content).toMatch(/import\s*\{[^}]*Suggestion[^}]*\}\s*from\s*["']@\/kilocode\/suggestion["']/)
  })

  test("calls Suggestion.dismissAll before restarting the session loop", () => {
    const content = fs.readFileSync(PROMPT_FILE, "utf-8")
    expect(content).toContain("Suggestion.dismissAll")
  })

  test("dismissAll and state.cancel appear together in a kilocode_change block", () => {
    const content = fs.readFileSync(PROMPT_FILE, "utf-8")
    // Both dismissAll and state.cancel are needed in the same block to fix
    // the stuck session race condition. state.cancel appears elsewhere in
    // prompt.ts (upstream code at line ~111), so we must verify it co-occurs
    // with dismissAll inside the same kilocode_change block.
    const block = content.match(/kilocode_change start[^\n]*dismiss[\s\S]*?kilocode_change end/)
    expect(block).not.toBeNull()
    expect(block![0]).toContain("Suggestion.dismissAll")
    expect(block![0]).toContain("state.cancel")
  })
})
