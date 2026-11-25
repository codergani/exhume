import { describe, it, expect } from 'vitest'
import {
  buildForkSummary,
  monthsSince,
  selectLivingForks,
  type ForkCandidate,
  type ForkResult,
} from '../src/lib/forks'

const NOW = new Date('2025-06-15T00:00:00Z')
const ORIGINAL = '2022-01-01T00:00:00Z'

function fork(overrides: Partial<ForkCandidate> = {}): ForkCandidate {
  return {
    owner: 'alice',
    name: 'repo',
    htmlUrl: 'https://github.com/alice/repo',
    starCount: 5,
    lastPushDate: '2025-05-01T00:00:00Z',
    archived: false,
    ...overrides,
  }
}

describe('monthsSince', () => {
  it('floors and clamps at 0', () => {
    expect(monthsSince('2025-06-01T00:00:00Z', NOW)).toBe(0)
    expect(monthsSince('2030-01-01T00:00:00Z', NOW)).toBe(0)
    expect(monthsSince('2025-03-15T00:00:00Z', NOW)).toBe(3)
  })
})

describe('selectLivingForks', () => {
  it('excludes archived forks', () => {
    expect(selectLivingForks([fork({ archived: true })], ORIGINAL, NOW)).toEqual([])
  })

  it('excludes stale forks', () => {
    expect(
      selectLivingForks([fork({ lastPushDate: '2023-01-01T00:00:00Z' })], ORIGINAL, NOW),
    ).toEqual([])
  })

  it('excludes forks not later than the original, including an equal timestamp', () => {
    const original = '2025-02-01T00:00:00Z'
    const older = fork({ owner: 'older', lastPushDate: '2025-01-01T00:00:00Z' })
    const equal = fork({ owner: 'equal', lastPushDate: original })
    const newer = fork({ owner: 'newer', lastPushDate: '2025-02-02T00:00:00Z' })
    expect(selectLivingForks([older, equal, newer], original, NOW)).toEqual([newer])
  })

  it('keeps 11 months and drops 12 months since last push', () => {
    const eleven = fork({ owner: 'eleven', lastPushDate: '2024-07-15T00:00:00Z' })
    const twelve = fork({ owner: 'twelve', lastPushDate: '2024-06-14T00:00:00Z' })
    expect(monthsSince(eleven.lastPushDate, NOW)).toBe(11)
    expect(monthsSince(twelve.lastPushDate, NOW)).toBe(12)
    expect(selectLivingForks([eleven, twelve], ORIGINAL, NOW)).toEqual([eleven])
  })

  it('orders by stars descending first', () => {
    const low = fork({ owner: 'low', starCount: 1 })
    const high = fork({ owner: 'high', starCount: 9 })
    expect(selectLivingForks([low, high], ORIGINAL, NOW).map((f) => f.owner)).toEqual([
      'high',
      'low',
    ])
  })

  it('breaks star ties by most recent push', () => {
    const older = fork({ owner: 'older', lastPushDate: '2025-03-01T00:00:00Z' })
    const newer = fork({ owner: 'newer', lastPushDate: '2025-05-01T00:00:00Z' })
    expect(selectLivingForks([older, newer], ORIGINAL, NOW).map((f) => f.owner)).toEqual([
      'newer',
      'older',
    ])
  })

  it('breaks remaining ties by owner name ascending, case-insensitive', () => {
    const b = fork({ owner: 'bob' })
    const a = fork({ owner: 'Alice' })
    const c = fork({ owner: 'carol' })
    expect(selectLivingForks([c, b, a], ORIGINAL, NOW).map((f) => f.owner)).toEqual([
      'Alice',
      'bob',
      'carol',
    ])
  })

  it('returns at most 3', () => {
    const forks = ['a', 'b', 'c', 'd', 'e'].map((owner, i) => fork({ owner, starCount: i }))
    const result = selectLivingForks(forks, ORIGINAL, NOW)
    expect(result).toHaveLength(3)
    expect(result.map((f) => f.owner)).toEqual(['e', 'd', 'c'])
  })

  it('gives deeply equal output for the same input called twice', () => {
    const forks = [fork({ owner: 'x', starCount: 2 }), fork({ owner: 'y', starCount: 3 })]
    expect(selectLivingForks(forks, ORIGINAL, NOW)).toEqual(selectLivingForks(forks, ORIGINAL, NOW))
  })

  it('does not mutate the input array', () => {
    const forks = [
      fork({ owner: 'x', starCount: 1 }),
      fork({ owner: 'y', starCount: 3 }),
      fork({ owner: 'z', starCount: 2, archived: true }),
    ]
    const snapshot = structuredClone(forks)
    const refs = [...forks]
    selectLivingForks(forks, ORIGINAL, NOW)
    expect(forks).toEqual(snapshot)
    forks.forEach((f, i) => expect(f).toBe(refs[i]))
  })
})

describe('buildForkSummary', () => {
  it('maps skipped to unavailable', () => {
    expect(buildForkSummary({ status: 'skipped' }, NOW)).toEqual({ status: 'unavailable' })
  })

  it('maps unavailable to unavailable', () => {
    expect(buildForkSummary({ status: 'unavailable', message: 'sealed' }, NOW)).toEqual({
      status: 'unavailable',
    })
  })

  it('keeps a real zero for available with no living forks', () => {
    const result: ForkResult = { status: 'available', living: [], inspected: 12, livingTotal: 0 }
    expect(buildForkSummary(result, NOW)).toEqual({ status: 'available', livingCount: 0, top: [] })
  })

  it('mirrors only owner, name, stars and monthsSincePush', () => {
    const result: ForkResult = {
      status: 'available',
      living: [
        fork({ owner: 'alice', name: 'repo', starCount: 7, lastPushDate: '2025-03-15T00:00:00Z' }),
        fork({ owner: 'bob', name: 'repo2', starCount: 3, lastPushDate: '2025-06-01T00:00:00Z' }),
      ],
      inspected: 30,
      livingTotal: 5,
    }
    expect(buildForkSummary(result, NOW)).toEqual({
      status: 'available',
      livingCount: 5,
      top: [
        { owner: 'alice', name: 'repo', stars: 7, monthsSincePush: 3 },
        { owner: 'bob', name: 'repo2', stars: 3, monthsSincePush: 0 },
      ],
    })
  })
})
