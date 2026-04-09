// kilocode_change - new file
import { generateText } from "ai"
import { mergeDeep } from "remeda"
import { Provider } from "@/provider/provider"
import { ProviderTransform } from "@/provider/transform"
import { Log } from "@/util/log"

const log = Log.create({ service: "branch-name" })

const MAX_PROMPT_LENGTH = 500
const MAX_SLUG_LENGTH = 40

const SYSTEM_PROMPT = `Generate a concise git branch name slug for a coding task.

Rules:
- Output ONLY the slug (no prefix, no path separators, no explanation, nothing else)
- Lowercase letters, numbers, and hyphens only
- Maximum ${MAX_SLUG_LENGTH} characters
- Start with a verb in imperative form when possible
- Capture the essence of the task

Examples:
Task: "Fix the login button not working on mobile"
Output: fix-login-button-mobile

Task: "Add dark mode support to settings page"
Output: add-dark-mode-settings

Task: "Refactor authentication module to use JWT"
Output: refactor-auth-to-jwt

Task: "Update dependencies and fix security vulnerabilities"
Output: update-deps-fix-security`

function clean(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, "")
}

export async function generateBranchSlug(prompt: string): Promise<string> {
  const truncated = prompt.slice(0, MAX_PROMPT_LENGTH)
  log.info("generating", { length: truncated.length })

  const defaultModel = await Provider.defaultModel()
  const model =
    (await Provider.getSmallModel(defaultModel.providerID)) ??
    (await Provider.getModel(defaultModel.providerID, defaultModel.modelID))

  const language = await Provider.getLanguage(model)

  const result = await generateText({
    model: language,
    temperature: model.capabilities.temperature ? 0.3 : undefined,
    providerOptions: ProviderTransform.providerOptions(
      model,
      mergeDeep(ProviderTransform.smallOptions(model), model.options),
    ),
    maxRetries: 3,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user" as const, content: truncated }],
  })

  const slug = clean(result.text)
  if (!slug) throw new Error("LLM returned an empty branch name slug")
  log.info("generated", { slug })
  return slug
}
