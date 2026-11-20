import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { classifyStatus } from '../src/lib/classifyStatus'
import {
  repoVitalsArb,
  deadVitalsArb,
  dyingVitalsArb,
  aliveVitalsArb,
} from './arbitraries'

const RUNS = 500

describe('classifyStatus — property-based tests', () => {
  /**
   * Design Property 3 — classifyStatus is total.
   * For any RepoVitals, returns exactly one of DEAD/DYING/ALIVE, never throws.
   * Requirement: 2.4
   */
  it('Property 3: is total — always returns DEAD, DYING, or ALIVE without throwing', () => {
    fc.assert(
      fc.property(repoVitalsArb, (v) => {
        const result = classifyStatus(v)
        expect(['DEAD', 'DYING', 'ALIVE']).toContain(result)
      }),
      { numRuns: RUNS },
    )
  })

  /**
   * Design Property 4 — DEAD condition.
   * archived=true OR monthsSinceLastPush >= 24 always yields DEAD.
   * Requirement: 2.2
   */
  it('Property 4: returns DEAD when archived or months >= 24', () => {
    fc.assert(
      fc.property(deadVitalsArb, (v) => {
        expect(classifyStatus(v)).toBe('DEAD')
      }),
      { numRuns: RUNS },
    )
  })

  /**
   * Design Property 5 — DYING condition.
   * not archived AND 12 <= months < 24 always yields DYING.
   * Requirement: 2.3
   */
  it('Property 5: returns DYING when not archived and 12 <= months < 24', () => {
    fc.assert(
      fc.property(dyingVitalsArb, (v) => {
        expect(classifyStatus(v)).toBe('DYING')
      }),
      { numRuns: RUNS },
    )
  })

  /**
   * Design Property 6 — ALIVE condition.
   * not archived AND months < 12 always yields ALIVE.
   * Requirement: 2.3
   */
  it('Property 6: returns ALIVE when not archived and months < 12', () => {
    fc.assert(
      fc.property(aliveVitalsArb, (v) => {
        expect(classifyStatus(v)).toBe('ALIVE')
      }),
      { numRuns: RUNS },
    )
  })

  /**
   * Design Property 7 — determinism.
   * Calling classifyStatus twice with the same input always returns the same result.
   * Requirement: 2.4
   */
  it('Property 7: is deterministic — same input always produces same output', () => {
    fc.assert(
      fc.property(repoVitalsArb, (v) => {
        expect(classifyStatus(v)).toBe(classifyStatus(v))
      }),
      { numRuns: RUNS },
    )
  })

  /**
   * Additional property: severity never decreases as months increase.
   * Ordering: ALIVE < DYING < DEAD (by urgency).
   * For any two vitals with the same archived flag, if months_a < months_b
   * then severity(a) is never more severe than severity(b).
   * Requirement: 2.2, 2.3
   */
  it('monotonicity: severity never decreases as months increase (archived=false)', () => {
    const rank: Record<string, number> = { ALIVE: 0, DYING: 1, DEAD: 2 }
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 119 }),
        fc.integer({ min: 1, max: 120 }),
        (a, delta) => {
          const b = a + delta
          const baseVitals = {
            lastPushDate: '2020-01-01T00:00:00Z',
            archived: false,
            openIssueCount: 0,
            starCount: 0,
          }
          const statusA = classifyStatus({ ...baseVitals, monthsSinceLastPush: a })
          const statusB = classifyStatus({ ...baseVitals, monthsSinceLastPush: b })
          expect(rank[statusA]).toBeLessThanOrEqual(rank[statusB])
        },
      ),
      { numRuns: RUNS },
    )
  })
})
