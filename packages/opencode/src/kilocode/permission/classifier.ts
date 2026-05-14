import { $ } from "bun"
import { Instance } from "@/project/instance"
import type { ConfigPermission } from "@/config/permission"

export namespace PermissionClassifier {
  export const environment = [
    "The current working directory and files reachable inside it are the primary trusted workspace.",
    "Git remotes configured for this repository are trusted only for normal fetch, pull, and push operations on the active session branch.",
  ]

  export const allow = [
    "Install package dependencies that are explicitly declared by this project, including package manager install commands that do not introduce new packages.",
    "Push commits to the active session working branch or an explicitly named branch created for the current task.",
    "Complete standard credential and authentication flows requested by the user, including opening provider login URLs and reading the resulting non-secret status.",
  ]

  export const soft_deny = [
    "Destructive operations that delete, overwrite, reset, reformat, or irreversibly mutate user data outside the requested task scope.",
    "Exfiltrating source code, private files, environment variables, tokens, credentials, keys, cookies, or secrets to external services or logs.",
    "Weakening security posture by disabling safeguards, changing auth or permission settings, bypassing scanners, or modifying protected configuration without explicit user intent.",
    "Crossing trust boundaries such as writing outside the workspace, accessing unrelated repositories, contacting untrusted endpoints, or using unexpected network destinations.",
    "Bypassing human review, code review, CI, protected branches, signing requirements, policy checks, or other approval gates.",
    "Publishing, exposing, or making private work public, including creating public links, changing repository visibility, or uploading artifacts to public storage.",
    "Using sudo, privilege escalation, system package managers, kernel or service managers, or modifying system directories such as /etc, /usr, /bin, /sbin, or platform equivalents.",
    "Dumping, printing, decoding, exporting, or persisting credentials, secrets, keychains, password stores, SSH keys, cloud credentials, or browser tokens.",
    "Forceful deletion or history rewriting such as rm -rf on broad paths, git reset --hard, git clean -fd, force push, destructive database migrations, or wiping caches that may contain user state.",
    "Commands matching high-risk automatic-mode classes: curl-pipe-to-shell, unreviewed script execution from the network, chmod/chown on broad paths, recursive permission changes, or disabling backups.",
  ]

  export const defaults = {
    environment,
    allow,
    soft_deny,
  } as const

  export type Resolved = {
    enabled: boolean
    model?: string | null
    environment: string[]
    allow: string[]
    soft_deny: string[]
  }

  export function resolve(cfg?: ConfigPermission.Classifier | null): Resolved {
    if (!cfg) {
      return {
        enabled: false,
        environment: [...environment],
        allow: [...allow],
        soft_deny: [...soft_deny],
      }
    }

    return {
      enabled: true,
      model: cfg.model,
      environment: cfg.environment ? [...cfg.environment] : [...environment],
      allow: cfg.allow ? [...cfg.allow] : [...allow],
      soft_deny: cfg.soft_deny ? [...cfg.soft_deny] : [...soft_deny],
    }
  }

  export async function context() {
    const cwd = Instance.directory
    const remote = await $`git remote -v`
      .cwd(cwd)
      .quiet()
      .nothrow()
      .text()
      .then((text) => text.trim())
      .catch(() => "")
    const remotes = Array.from(new Set(remote.split(/\r?\n/).filter(Boolean)))
    return {
      cwd,
      remotes,
      environment: [
        ...environment,
        `Current working directory: ${cwd}`,
        ...remotes.map((item) => `Git remote: ${item}`),
      ],
    }
  }
}
