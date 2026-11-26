import { z } from 'zod'

export const revivalStepSchema = z.object({
  order: z.number().int().positive(),
  action: z.string().min(1),
  rationale: z.string().min(1),
})

export const forkRecommendationSchema = z.object({
  kind: z.enum(['adopt-fork', 'revive-original']),
  fork: z.string().min(1).optional(),
  reason: z.string().min(1),
})

export const overviewSchema = z.object({
  purpose: z.string().min(1).max(300),
  audience: z.string().min(1).max(200),
  quickStart: z.array(z.string().min(1).max(200)).max(3),
})

// Approach: `.optional().catch(undefined)` (primary). A malformed `overview` is
// dropped on its own and never fails the whole reply. Verified under the
// installed Zod 4: an absent `overview` yields no `overview` key on the output.
export const autopsyReportSchema = z.object({
  causeOfDeath: z.string().min(1),
  severity: z.enum(['critical', 'serious', 'stable']),
  steps: z.array(revivalStepSchema).min(3).max(7),
  recommendation: forkRecommendationSchema.optional(),
  overview: overviewSchema.optional().catch(undefined),
})

/** The shape returned by the AI — `generatedAt` is added by provider.ts after validation. */
export type AutopsyReportAiPayload = z.infer<typeof autopsyReportSchema>
