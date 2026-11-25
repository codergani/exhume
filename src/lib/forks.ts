/**
 * Pure fork selection and summary functions.
 * No I/O, no clock reads, no randomness. Imports nothing from src/ui, src/github or src/ai.
 */

/** A fork as reported by GitHub, trimmed to the fields this feature needs. */
export interface ForkCandidate {
  owner: string
  name: string
  htmlUrl: string
  starCount: number
  lastPushDate: string // ISO 8601
  archived: boolean
}

/** A ForkCandidate that satisfies the living-fork test. */
export type LivingFork = ForkCandidate

/** The forks step's outcome. */
export type ForkResult =
  | { status: 'skipped' }
  | { status: 'available'; living: LivingFork[]; inspected: number; livingTotal: number }
  | { status: 'unavailable'; message: string }

/** The no-code summary sent to the AI. */
export type ForkSummary =
  | {
      status: 'available'
      livingCount: number
      top: Array<{ owner: string; name: string; stars: number; monthsSincePush: number }>
    }
  | { status: 'unavailable' }

const MS_PER_MONTH = 1000 * 60 * 60 * 24 * 30.44

/** Months between an ISO date and `now`, floored and clamped at 0. */
export function monthsSince(iso: string, now: Date): number {
  const months = Math.floor((now.getTime() - Date.parse(iso)) / MS_PER_MONTH)
  return Math.max(0, months)
}

/**
 * Keeps forks that are not archived, pushed within the last 12 months and pushed
 * strictly later than the original. Orders by stars desc, last push desc, owner asc
 * (case-insensitive), stable on ties. Returns at most 3. Does not mutate the input.
 */
export function selectLivingForks(
  forks: ForkCandidate[],
  originalLastPush: string,
  now: Date,
): LivingFork[] {
  const originalTime = Date.parse(originalLastPush)
  return forks
    .filter(
      (f) =>
        !f.archived &&
        monthsSince(f.lastPushDate, now) < 12 &&
        Date.parse(f.lastPushDate) > originalTime,
    )
    .sort((a, b) => {
      if (b.starCount !== a.starCount) return b.starCount - a.starCount
      const pushDiff = Date.parse(b.lastPushDate) - Date.parse(a.lastPushDate)
      if (pushDiff !== 0) return pushDiff
      return a.owner.toLowerCase().localeCompare(b.owner.toLowerCase())
    })
    .slice(0, 3)
}

/**
 * Maps a ForkResult to the AI/fallback payload. 'skipped' and 'unavailable' both
 * become { status: 'unavailable' }. An 'available' result with no living forks is a
 * real zero and keeps livingCount 0.
 */
export function buildForkSummary(result: ForkResult, now: Date): ForkSummary {
  if (result.status !== 'available') return { status: 'unavailable' }
  return {
    status: 'available',
    livingCount: result.livingTotal,
    top: result.living.map((f) => ({
      owner: f.owner,
      name: f.name,
      stars: f.starCount,
      monthsSincePush: monthsSince(f.lastPushDate, now),
    })),
  }
}
