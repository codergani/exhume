import { z } from 'zod'

export const revivalStepSchema = z.object({
  order: z.number().int().positive(),
  action: z.string().min(1),
  rationale: z.string().min(1),
})

export const autopsyReportSchema = z.object({
  causeOfDeath: z.string().min(1),
  severity: z.enum(['critical', 'serious', 'stable']),
  steps: z.array(revivalStepSchema).min(3).max(7),
})

/** The shape returned by the AI — `generatedAt` is added by provider.ts after validation. */
export type AutopsyReportAiPayload = z.infer<typeof autopsyReportSchema>
