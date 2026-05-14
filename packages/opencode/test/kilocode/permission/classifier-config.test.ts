import { describe, expect, test } from "bun:test"
import { Config } from "../../../src/config/config"
import { ConfigPermission } from "../../../src/config/permission"
import { PermissionClassifier } from "../../../src/kilocode/permission/classifier"

describe("permission classifier config", () => {
  test("parses alongside existing scalar and object permission rules", () => {
    const parsed = Config.Info.zod.parse({
      permission: {
        read: "allow",
        bash: {
          "bun test": "ask",
        },
        classifier: {
          model: "anthropic/claude-sonnet-4-5",
          environment: ["workspace only"],
          allow: ["run declared installs"],
          soft_deny: ["destructive writes"],
        },
      },
    })

    expect(parsed.permission?.read).toBe("allow")
    expect(parsed.permission?.bash).toEqual({ "bun test": "ask" })
    expect(parsed.permission?.classifier).toEqual({
      model: "anthropic/claude-sonnet-4-5",
      environment: ["workspace only"],
      allow: ["run declared installs"],
      soft_deny: ["destructive writes"],
    })
  })

  test("resolves disabled state with default policy", () => {
    const cfg = PermissionClassifier.resolve()

    expect(cfg.enabled).toBe(false)
    expect(cfg.environment).toEqual(PermissionClassifier.environment)
    expect(cfg.allow).toEqual(PermissionClassifier.allow)
    expect(cfg.soft_deny).toEqual(PermissionClassifier.soft_deny)
  })

  test("falls back per missing field", () => {
    const cfg = PermissionClassifier.resolve({
      model: "openai/gpt-5.1",
      environment: ["repo root"],
    })

    expect(cfg.enabled).toBe(true)
    expect(cfg.model).toBe("openai/gpt-5.1")
    expect(cfg.environment).toEqual(["repo root"])
    expect(cfg.allow).toEqual(PermissionClassifier.allow)
    expect(cfg.soft_deny).toEqual(PermissionClassifier.soft_deny)
  })

  test("replaces allow and soft_deny lists instead of merging defaults", () => {
    const cfg = PermissionClassifier.resolve({
      allow: ["only this allow"],
      soft_deny: ["only this deny"],
    })

    expect(cfg.allow).toEqual(["only this allow"])
    expect(cfg.soft_deny).toEqual(["only this deny"])
  })

  test("parses nullable classifier as disabled config", () => {
    const parsed = ConfigPermission.Info.zod.parse({ classifier: null })
    const cfg = PermissionClassifier.resolve(parsed.classifier)

    expect(cfg.enabled).toBe(false)
  })
})
