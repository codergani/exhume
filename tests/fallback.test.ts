import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { buildFallbackReport } from '../src/ai/fallback'
import type { ForkSummary } from '../src/lib/forks'
import type { RepoVitals } from '../src/github/client'
import type { DepRotReport } from '../src/github/deps'

function vitals(months: number, archived = false, stars = 100, issues = 5): RepoVitals {
  return {
    lastPushDate: '2020-01-01T00:00:00Z',
    archived,
    openIssueCount: issues,
    starCount: stars,
    monthsSinceLastPush: months,
  }
}

const depRotWithOutdated: DepRotReport = {
  packageName: 'my-pkg',
  dependenciesChecked: 3,
  outdatedDeps: [
    { name: 'react', current: '^17.0.0', latest: '19.0.0', majorsBehind: 2 },
    { name: 'lodash', current: '^3.0.0', latest: '4.17.21', majorsBehind: 1 },
  ],
  skipped: false,
  skipReason: undefined,
}

const depRotSkipped: DepRotReport = {
  packageName: '',
  dependenciesChecked: 0,
  outdatedDeps: [],
  skipped: true,
  skipReason: 'No package.json found at repository root',
}

const depRotNoOutdated: DepRotReport = {
  packageName: 'my-pkg',
  dependenciesChecked: 5,
  outdatedDeps: [],
  skipped: false,
  skipReason: undefined,
}

describe('buildFallbackReport', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  // --- severity paths ---

  it('returns severity=critical for DEAD repo (months >= 24)', () => {
    const r = buildFallbackReport(vitals(30), depRotSkipped)
    expect(r.severity).toBe('critical')
  })

  it('returns severity=critical for archived repo', () => {
    const r = buildFallbackReport(vitals(0, true), depRotSkipped)
    expect(r.severity).toBe('critical')
  })

  it('returns severity=serious for DYING repo (12 <= months < 24)', () => {
    const r = buildFallbackReport(vitals(18), depRotSkipped)
    expect(r.severity).toBe('serious')
  })

  it('returns severity=stable for ALIVE repo (months < 12)', () => {
    const r = buildFallbackReport(vitals(6), depRotSkipped)
    expect(r.severity).toBe('stable')
  })

  // --- cause of death ---

  it('mentions archived in causeOfDeath when archived', () => {
    const r = buildFallbackReport(vitals(0, true), depRotSkipped)
    expect(r.causeOfDeath).toMatch(/archived/i)
  })

  it('mentions month count in causeOfDeath when months >= 24', () => {
    const r = buildFallbackReport(vitals(36), depRotSkipped)
    expect(r.causeOfDeath).toMatch(/36/)
  })

  it('mentions month count in causeOfDeath when 12 <= months < 24', () => {
    const r = buildFallbackReport(vitals(14), depRotSkipped)
    expect(r.causeOfDeath).toMatch(/14/)
  })

  // --- step structure ---

  it('always produces exactly 3 steps', () => {
    expect(buildFallbackReport(vitals(30), depRotSkipped).steps).toHaveLength(3)
    expect(buildFallbackReport(vitals(18), depRotWithOutdated).steps).toHaveLength(3)
    expect(buildFallbackReport(vitals(6), depRotNoOutdated).steps).toHaveLength(3)
  })

  it('steps have contiguous order values 1, 2, 3', () => {
    const r = buildFallbackReport(vitals(20), depRotSkipped)
    expect(r.steps.map((s) => s.order)).toEqual([1, 2, 3])
  })

  // --- dep-rot branch ---

  it('step 2 mentions outdated count when outdated deps are present', () => {
    const r = buildFallbackReport(vitals(30), depRotWithOutdated)
    expect(r.steps[1].action).toMatch(/2/)          // 2 outdated deps
    expect(r.steps[1].rationale).toMatch(/2 major/) // maxMajorsBehind = 2
  })

  it('step 2 mentions audit when dep rot is skipped', () => {
    const r = buildFallbackReport(vitals(30), depRotSkipped)
    expect(r.steps[1].action).toMatch(/audit/i)
  })

  it('step 2 mentions audit when no deps are outdated', () => {
    const r = buildFallbackReport(vitals(30), depRotNoOutdated)
    expect(r.steps[1].action).toMatch(/audit/i)
  })

  // --- never throws ---

  it('never throws for any valid vitals', () => {
    expect(() => buildFallbackReport(vitals(0), depRotSkipped)).not.toThrow()
    expect(() => buildFallbackReport(vitals(100, true), depRotWithOutdated)).not.toThrow()
  })

  // --- generatedAt ---

  it('generatedAt is a valid ISO string', () => {
    const r = buildFallbackReport(vitals(10), depRotSkipped)
    expect(() => new Date(r.generatedAt).toISOString()).not.toThrow()
  })
})

describe('buildFallbackReport with fork summary', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-01-01T00:00:00Z'))
  })
  afterEach(() => { vi.useRealTimers() })

  const withFork: ForkSummary = {
    status: 'available',
    livingCount: 1,
    top: [{ owner: 'alice', name: 'phoenix', stars: 120, monthsSincePush: 3 }],
  }

  it('is identical to the 2-argument result when forks are absent or empty', () => {
    const base = buildFallbackReport(vitals(30), depRotWithOutdated)
    const empty: ForkSummary = { status: 'available', livingCount: 0, top: [] }
    expect(buildFallbackReport(vitals(30), depRotWithOutdated, undefined)).toEqual(base)
    expect(buildFallbackReport(vitals(30), depRotWithOutdated, { status: 'unavailable' })).toEqual(base)
    expect(buildFallbackReport(vitals(30), depRotWithOutdated, empty)).toEqual(base)
  })

  it('names the top fork in step 3 and keeps steps 1 and 2', () => {
    const base = buildFallbackReport(vitals(30), depRotWithOutdated)
    const r = buildFallbackReport(vitals(30), depRotWithOutdated, withFork)
    const text = r.steps.map((s) => `${s.action} ${s.rationale}`).join(' ')
    expect(text).toContain('alice/phoenix')
    expect(r.steps).toHaveLength(3)
    expect(r.steps.map((s) => s.order)).toEqual([1, 2, 3])
    expect(r.steps[0]).toEqual(base.steps[0])
    expect(r.steps[1]).toEqual(base.steps[1])
  })

  it('never includes a recommendation property', () => {
    expect('recommendation' in buildFallbackReport(vitals(30), depRotSkipped)).toBe(false)
    expect('recommendation' in buildFallbackReport(vitals(30), depRotSkipped, withFork)).toBe(false)
  })
})
