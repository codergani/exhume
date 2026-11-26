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

describe('overview', () => {
  const validOverview = {
    purpose: 'Parses things.',
    audience: 'Developers.',
    quickStart: ['npm install', 'npm start'],
  }

  function parse(overview: unknown) {
    const result = autopsyReportSchema.safeParse(reply({ overview }))
    if (!result.success) throw new Error('expected a successful parse')
    return result.data
  }

  function expectDropped(overview: unknown) {
    const data = parse(overview)
    expect(data.overview).toBeUndefined()
    expect(data.causeOfDeath).toBe('x')
    expect(data.severity).toBe('critical')
    expect(data.steps).toEqual(steps)
  }

  it('parses a reply without overview and leaves no overview key', () => {
    const result = autopsyReportSchema.safeParse(reply())
    expect(result.success).toBe(true)
    if (result.success) {
      expect('overview' in result.data).toBe(false)
      expect(result.data).toEqual(reply())
    }
  })

  it('keeps a valid overview', () => {
    expect(parse(validOverview).overview).toEqual(validOverview)
  })

  it('accepts an empty quickStart list', () => {
    const o = { ...validOverview, quickStart: [] }
    expect(parse(o).overview).toEqual(o)
  })

  it('accepts exactly 3 quickStart steps', () => {
    const o = { ...validOverview, quickStart: ['a', 'b', 'c'] }
    expect(parse(o).overview).toEqual(o)
  })

  it('accepts a 300-character purpose and a 200-character audience', () => {
    const o = { ...validOverview, purpose: 'p'.repeat(300), audience: 'a'.repeat(200) }
    expect(parse(o).overview).toEqual(o)
  })

  it('drops an overview with a 301-character purpose', () => {
    expectDropped({ ...validOverview, purpose: 'p'.repeat(301) })
  })

  it('drops an overview with a 201-character audience', () => {
    expectDropped({ ...validOverview, audience: 'a'.repeat(201) })
  })

  it('drops an overview with a 201-character quickStart step', () => {
    expectDropped({ ...validOverview, quickStart: ['s'.repeat(201)] })
  })

  it('drops an overview with an empty string field', () => {
    expectDropped({ ...validOverview, purpose: '' })
    expectDropped({ ...validOverview, quickStart: [''] })
  })

  it('drops an overview with 4 quickStart steps', () => {
    expectDropped({ ...validOverview, quickStart: ['a', 'b', 'c', 'd'] })
  })

  it('drops a non-object overview', () => {
    expectDropped('text')
    expectDropped(42)
    expectDropped(null)
  })

  it('drops an overview with a wrong-typed field', () => {
    expectDropped({ ...validOverview, purpose: 7 })
    expectDropped({ ...validOverview, quickStart: 'npm start' })
  })

  it('still fails when the rest of the reply is malformed', () => {
    const r = reply({ overview: validOverview }, steps.slice(0, 2))
    expect(autopsyReportSchema.safeParse(r).success).toBe(false)
  })
})
