import { describe, it, expect } from 'vitest'
import { reportLines, FALLBACK_MARKER } from '../src/ui/lines'
import type { AutopsyReport } from '../src/ai/fallback'

const base: AutopsyReport = {
  causeOfDeath: 'No commits in 50 months.',
  severity: 'critical',
  steps: [
    { order: 1, action: 'Assess interest', rationale: 'Stars matter.' },
    { order: 2, action: 'Audit deps', rationale: 'Manual audit.' },
  ],
  generatedAt: '2024-01-01T00:00:00.000Z',
}

describe('reportLines', () => {
  it('without overview matches the pre-feature output exactly', () => {
    expect(reportLines(base)).toEqual([
      'CAUSE OF DEATH',
      'No commits in 50 months.',
      '',
      'SEVERITY: CRITICAL',
      '',
      'RESURRECTION PLAN',
      '1. Assess interest',
      '   Stars matter.',
      '2. Audit deps',
      '   Manual audit.',
    ])
  })

  it('puts the overview block before CAUSE OF DEATH with numbered steps', () => {
    const lines = reportLines({
      ...base,
      overview: { purpose: 'Parses things', audience: 'Developers', quickStart: ['npm i', 'npm start'] },
    })
    expect(lines.slice(0, 8)).toEqual([
      'OVERVIEW',
      'Purpose: Parses things',
      'Audience: Developers',
      'Quick start:',
      '  1. npm i',
      '  2. npm start',
      '',
      'CAUSE OF DEATH',
    ])
  })

  it('collapses whitespace and newlines to single spaces', () => {
    const lines = reportLines({
      ...base,
      overview: { purpose: '  a\n\n  b\t c ', audience: 'x\ny', quickStart: ['run\n  it'] },
    })
    expect(lines[1]).toBe('Purpose: a b c')
    expect(lines[2]).toBe('Audience: x y')
    expect(lines[4]).toBe('  1. run it')
  })

  it('prints no Quick start line for an empty list', () => {
    const lines = reportLines({
      ...base,
      overview: { purpose: 'p', audience: 'a', quickStart: [] },
    })
    expect(lines.slice(0, 5)).toEqual(['OVERVIEW', 'Purpose: p', 'Audience: a', '', 'CAUSE OF DEATH'])
    expect(lines.some((l) => l.includes('Quick start'))).toBe(false)
  })

  it('keeps the marker first, then OVERVIEW', () => {
    const lines = reportLines(
      { ...base, overview: { purpose: 'p', audience: 'a', quickStart: [] } },
      true,
    )
    expect(lines[0]).toBe(FALLBACK_MARKER)
    expect(lines[1]).toBe('')
    expect(lines[2]).toBe('OVERVIEW')
  })
})
