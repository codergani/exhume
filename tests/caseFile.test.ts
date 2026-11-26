import { describe, expect, it } from 'vitest'
import { autopsyReportSchema } from '../src/ai/schema'
import { loadCaseFile } from '../src/lib/caseFile'

function makeCase(): Mut {
  return {
    id: 'sample-one',
    owner: 'lanternworks',
    repo: 'lantern',
    capturedAt: '2025-06-15T12:00:00Z',
    license: 'Apache-2.0',
    source: { kind: 'fictional', readmeOrigin: 'written-for-sample' },
    vitals: {
      lastPushDate: '2024-11-15T09:30:00Z',
      archived: false,
      openIssueCount: 4,
      starCount: 128,
      monthsSinceLastPush: 7,
    },
    forks: {
      status: 'available',
      living: [
        {
          owner: 'someone',
          name: 'lantern',
          htmlUrl: 'https://github.com/someone/lantern',
          starCount: 3,
          lastPushDate: '2025-05-01T00:00:00Z',
          archived: false,
        },
      ],
      inspected: 5,
      livingTotal: 1,
    },
    readme: { text: 'lantern\n\nWatches a folder.', truncated: false },
    report: {
      causeOfDeath: 'Not dead. Last push 7 months ago.',
      severity: 'stable',
      steps: [
        { order: 1, action: 'Triage 4 issues', rationale: 'Four are open.' },
        { order: 2, action: 'Cut a release', rationale: 'Ends the gap.' },
        { order: 3, action: 'Set a review date', rationale: 'Before 12 months.' },
      ],
      generatedAt: '2025-06-15T12:00:05Z',
      overview: {
        purpose: 'Watches a folder.',
        audience: 'Developers.',
        quickStart: ['Run lantern watch ./notes.'],
      },
    },
  }
}

// Test fixtures are deliberately loose so each case can break one field.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Mut = Record<string, any>

const load = (input: unknown) => loadCaseFile(input, autopsyReportSchema)

function mutated(fn: (c: Mut) => void) {
  const c = makeCase()
  fn(c)
  return load(c)
}

describe('loadCaseFile', () => {
  it('accepts a valid case with the exact typed output', () => {
    const result = load(makeCase())
    expect(result).toEqual({ ok: true, case: makeCase() })
  })

  it('accepts forks skipped and a case without overview or recommendation', () => {
    const result = mutated((c) => {
      c.forks = { status: 'skipped' }
      delete c.report.overview
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.case.forks).toEqual({ status: 'skipped' })
      expect('overview' in result.case.report).toBe(false)
    }
  })

  it.each([null, undefined, [], [1], 42, 'text', true])('rejects non-object input %j', (input) => {
    expect(load(input)).toEqual({ ok: false, reason: 'not a case file' })
  })

  it('never throws on hostile input', () => {
    const hostile = { get id(): string { throw new Error('boom') } }
    expect(load(hostile)).toEqual({ ok: false, reason: 'unreadable case file' })
  })

  it.each([
    ['empty owner', (c: Mut) => { c.owner = '' }],
    ['empty repo', (c: Mut) => { c.repo = '' }],
    ['owner with slash', (c: Mut) => { c.owner = 'a/b' }],
    ['bad id', (c: Mut) => { c.id = 'Bad Id' }],
    ['empty license', (c: Mut) => { c.license = '  ' }],
    ['bad capturedAt', (c: Mut) => { c.capturedAt = '2025-13-45T00:00:00Z' }],
    ['date without time', (c: Mut) => { c.capturedAt = '2025-06-15' }],
    ['bad vitals date', (c: Mut) => { c.vitals.lastPushDate = 'yesterday' }],
    ['bad fork date', (c: Mut) => { c.forks.living[0].lastPushDate = 'nope' }],
    ['bad generatedAt', (c: Mut) => { c.report.generatedAt = 'soon' }],
    ['negative months', (c: Mut) => { c.vitals.monthsSinceLastPush = -1 }],
    ['fractional issues', (c: Mut) => { c.vitals.openIssueCount = 1.5 }],
    ['fractional stars', (c: Mut) => { c.vitals.starCount = 2.5 }],
    ['negative fork stars', (c: Mut) => { c.forks.living[0].starCount = -3 }],
    ['non-boolean archived', (c: Mut) => { c.vitals.archived = 'no' }],
    ['javascript: fork url', (c: Mut) => { c.forks.living[0].htmlUrl = 'javascript:alert(1)' }],
    ['http fork url', (c: Mut) => { c.forks.living[0].htmlUrl = 'http://github.com/a/b' }],
    ['readme too long', (c: Mut) => { c.readme.text = 'a'.repeat(6001) }],
    ['readme blank', (c: Mut) => { c.readme.text = ' \n ' }],
    ['readme control char', (c: Mut) => { c.readme.text = 'ok\u0001bad' }],
    ['readme U+007F', (c: Mut) => { c.readme.text = 'ok\u007Fbad' }],
    ['readme truncated not boolean', (c: Mut) => { c.readme.truncated = 'yes' }],
    ['forks unavailable', (c: Mut) => { c.forks = { status: 'unavailable', message: 'x' } }],
    ['too many living forks', (c: Mut) => {
      c.forks.living = [0, 1, 2, 3].map(() => ({ ...c.forks.living[0] }))
      c.forks.livingTotal = 4
      c.forks.inspected = 4
    }],
    ['livingTotal below living length', (c: Mut) => { c.forks.livingTotal = 0 }],
    ['inspected below livingTotal', (c: Mut) => { c.forks.inspected = 0 }],
    ['report with 2 steps', (c: Mut) => { c.report.steps.pop() }],
    ['bad source kind', (c: Mut) => { c.source.kind = 'real' }],
    ['from-repository without repository', (c: Mut) => {
      c.source = { kind: 'captured', readmeOrigin: 'from-repository' }
    }],
  ])('rejects %s', (_name, fn) => {
    const result = mutated(fn)
    expect(result.ok).toBe(false)
  })

  it('accepts from-repository with a repository', () => {
    const result = mutated((c) => {
      c.source = { kind: 'captured', readmeOrigin: 'from-repository', repository: 'a/b' }
    })
    expect(result.ok).toBe(true)
  })

  it('drops a malformed overview and accepts the case', () => {
    const result = mutated((c) => {
      c.report.overview = { purpose: '', audience: 5, quickStart: 'x' }
    })
    expect(result.ok).toBe(true)
    if (result.ok) expect('overview' in result.case.report).toBe(false)
  })

  it('is deterministic', () => {
    const input = makeCase()
    expect(load(input)).toEqual(load(input))
  })

  it('returns a new object with new arrays', () => {
    const input = makeCase()
    const result = load(input)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.case).not.toBe(input)
    expect(result.case.report).not.toBe(input.report)
    expect(result.case.report.steps).not.toBe(input.report.steps)
    expect(result.case.report.overview?.quickStart).not.toBe(input.report.overview.quickStart)
    if (result.case.forks.status === 'available') {
      expect(result.case.forks.living).not.toBe(input.forks.living)
    }
  })

  it('keeps field values out of reason strings', () => {
    const hostile = 'EVIL<script>owner'
    const badOwner = mutated((c) => { c.owner = hostile })
    const badUrl = mutated((c) => { c.forks.living[0].htmlUrl = 'javascript:SECRETVALUE' })
    const badDate = mutated((c) => { c.capturedAt = 'SECRETDATE' })
    for (const r of [badOwner, badUrl, badDate]) {
      expect(r.ok).toBe(false)
      if (!r.ok) {
        expect(r.reason).not.toContain('EVIL')
        expect(r.reason).not.toContain('SECRET')
      }
    }
  })
})
