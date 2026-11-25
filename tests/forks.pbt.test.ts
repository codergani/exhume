import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { monthsSince, selectLivingForks } from '../src/lib/forks'
import type { ForkCandidate } from '../src/lib/forks'

const HOUR_MS = 60 * 60 * 1000
const NOW_BASE_MS = Date.UTC(2025, 0, 1)

// Offsets are in hours relative to `now`: from ~5 years before to ~1 month after.
const offsetHoursArb = fc.integer({ min: -24 * 1800, max: 24 * 30 })

const isoFromOffset = (now: Date, hours: number): string =>
  new Date(now.getTime() + hours * HOUR_MS).toISOString()

// Small owner pool so duplicates and case-only differences are common.
const ownerArb = fc.constantFrom('alice', 'Alice', 'ALICE', 'bob', 'Bob', 'carol', 'Dave', 'dave', 'eve')

const scenarioArb = fc
  .record({
    nowOffsetDays: fc.integer({ min: 0, max: 365 * 3 }),
    originalOffset: offsetHoursArb,
    forks: fc.array(
      fc.record({
        owner: ownerArb,
        name: fc.constantFrom('repo', 'fork', 'lib'),
        stars: fc.integer({ min: 0, max: 5 }), // narrow range forces star ties
        pushOffset: offsetHoursArb,
        archived: fc.boolean(),
      }),
      { minLength: 0, maxLength: 40 },
    ),
  })
  .map(({ nowOffsetDays, originalOffset, forks }) => {
    const now = new Date(NOW_BASE_MS + nowOffsetDays * 24 * HOUR_MS)
    const candidates: ForkCandidate[] = forks.map((f, i) => ({
      owner: f.owner,
      name: f.name,
      htmlUrl: `https://github.com/${f.owner}/${f.name}-${i}`,
      starCount: f.stars,
      lastPushDate: isoFromOffset(now, f.pushOffset),
      archived: f.archived,
    }))
    return { now, originalLastPush: isoFromOffset(now, originalOffset), candidates }
  })

describe('selectLivingForks — property-based tests', () => {
  /**
   * Feature: revival-extras, Property 1: Living-fork selection is correctly filtered, capped and ordered
   * Validates: Requirements 1.3, 1.4, 1.5
   */
  it('Property 1: Living-fork selection is correctly filtered, capped and ordered', () => {
    fc.assert(
      fc.property(scenarioArb, ({ now, originalLastPush, candidates }) => {
        const result = selectLivingForks(candidates, originalLastPush, now)
        const originalTime = Date.parse(originalLastPush)
        const isLiving = (f: ForkCandidate): boolean =>
          !f.archived &&
          monthsSince(f.lastPushDate, now) < 12 &&
          Date.parse(f.lastPushDate) > originalTime

        // (a) capped at 3
        expect(result.length).toBeLessThanOrEqual(3)

        // (b) every item is living; (d) every item came from the input
        for (const item of result) {
          expect(item.archived).toBe(false)
          expect(monthsSince(item.lastPushDate, now)).toBeLessThan(12)
          expect(Date.parse(item.lastPushDate)).toBeGreaterThan(originalTime)
          expect(candidates).toContain(item)
        }

        // (c) ordering: stars desc, last push desc, owner asc (case-insensitive)
        for (let i = 1; i < result.length; i++) {
          const prev = result[i - 1]
          const cur = result[i]
          if (prev.starCount !== cur.starCount) {
            expect(prev.starCount).toBeGreaterThan(cur.starCount)
            continue
          }
          const prevPush = Date.parse(prev.lastPushDate)
          const curPush = Date.parse(cur.lastPushDate)
          if (prevPush !== curPush) {
            expect(prevPush).toBeGreaterThan(curPush)
            continue
          }
          expect(
            prev.owner.toLowerCase().localeCompare(cur.owner.toLowerCase()),
          ).toBeLessThanOrEqual(0)
        }

        // (e) no living fork is wrongly dropped
        expect(result.length).toBe(Math.min(3, candidates.filter(isLiving).length))
      }),
      { numRuns: 500 },
    )
  })
})
