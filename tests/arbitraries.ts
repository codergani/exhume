import fc from 'fast-check'
import type { RepoVitals } from '../src/github/client'

function makeVitals(months: number, archived: boolean): RepoVitals {
  return {
    lastPushDate: '2020-01-01T00:00:00Z',
    archived,
    openIssueCount: 0,
    starCount: 0,
    monthsSinceLastPush: months,
  }
}

/** Any valid RepoVitals (months 0–120, archived true/false). */
export const repoVitalsArb = fc.tuple(
  fc.integer({ min: 0, max: 120 }),
  fc.boolean(),
).map(([months, archived]) => makeVitals(months, archived))

/** Vitals that must classify as DEAD: archived=true OR months >= 24. */
export const deadVitalsArb = fc.oneof(
  // archived, any month count
  fc.tuple(fc.integer({ min: 0, max: 120 }), fc.constant(true))
    .map(([months, archived]) => makeVitals(months, archived)),
  // not archived, months >= 24
  fc.tuple(fc.integer({ min: 24, max: 120 }), fc.constant(false))
    .map(([months, archived]) => makeVitals(months, archived)),
)

/** Vitals that must classify as DYING: not archived, 12 <= months < 24. */
export const dyingVitalsArb = fc
  .integer({ min: 12, max: 23 })
  .map((months) => makeVitals(months, false))

/** Vitals that must classify as ALIVE: not archived, months < 12. */
export const aliveVitalsArb = fc
  .integer({ min: 0, max: 11 })
  .map((months) => makeVitals(months, false))
