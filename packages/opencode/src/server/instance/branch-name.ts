// kilocode_change - new file
import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import { generateBranchSlug } from "../../kilocode/branch-name"
import { lazy } from "../../util/lazy"
import { errors } from "../error"

export const BranchNameRoutes = lazy(() =>
  new Hono().post(
    "/",
    describeRoute({
      summary: "Generate branch name",
      description: "Generate a concise git branch name slug from a task prompt using AI.",
      operationId: "branchName.generate",
      responses: {
        200: {
          description: "Generated branch name slug",
          content: {
            "application/json": {
              schema: resolver(z.object({ branch: z.string() })),
            },
          },
        },
        ...errors(400),
      },
    }),
    validator(
      "json",
      z.object({
        prompt: z.string().min(1).meta({ description: "The task prompt to derive a branch name from" }),
      }),
    ),
    async (c) => {
      const body = c.req.valid("json")
      const branch = await generateBranchSlug(body.prompt)
      return c.json({ branch })
    },
  ),
)
