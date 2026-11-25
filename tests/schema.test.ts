import { describe, it, expect } from 'vitest'
import { autopsyReportSchema } from '../src/ai/schema'

const steps = [
  { order: 1, action: 'a', rationale: 'r' },
  { order: 2, action: 'b', rationale: 'r' },
  { order: 3, action: 'c', rationale: 'r' },
]

function reply(extra: Record<string, unknown> = {}, s = steps) {
  return { causeOfDeath: 'x', severity: 'critical', steps: s, ...extra }
}

describe('autopsyReportSchema recommendation', () => {
  it('accepts a reply without recommendation', () => {
    expect(autopsyReportSchema.safeParse(reply()).success).toBe(true)
  })

  it('accepts a valid adopt-fork recommendation', () => {
    const r = reply({ recommendation: { kind: 'adopt-fork', fork: 'owner/name', reason: 'alive' } })
    expect(autopsyReportSchema.safeParse(r).success).toBe(true)
  })

  it('accepts revive-original without fork', () => {
    const r = reply({ recommendation: { kind: 'revive-original', reason: 'no good forks' } })
    expect(autopsyReportSchema.safeParse(r).success).toBe(true)
  })

  it('rejects an unknown kind', () => {
    const r = reply({ recommendation: { kind: 'bury', reason: 'x' } })
    expect(autopsyReportSchema.safeParse(r).success).toBe(false)
  })

  it('rejects adopt-fork with an empty reason', () => {
    const r = reply({ recommendation: { kind: 'adopt-fork', fork: 'owner/name', reason: '' } })
    expect(autopsyReportSchema.safeParse(r).success).toBe(false)
  })

  it('still rejects fewer than 3 steps', () => {
    expect(autopsyReportSchema.safeParse(reply({}, steps.slice(0, 2))).success).toBe(false)
  })
})
