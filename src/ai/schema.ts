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

export const autopsyReportSchema = z.object({
  causeOfDeath: z.string().min(1),
  severity: z.enum(['critical', 'serious', 'stable']),
  steps: z.array(revivalStepSchema).min(3).max(7),
  recommendation: forkRecommendationSchema.optional(),
})

/** The shape returned by the AI — `generatedAt` is added by provider.ts after validation. */
export type AutopsyReportAiPayload = z.infer<typeof autopsyReportSchema>
