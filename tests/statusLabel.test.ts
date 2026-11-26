import { describe, it, expect } from 'vitest'
import { statusLabel } from '../src/lib/statusLabel'
import { classifyStatus } from '../src/lib/classifyStatus'
import type { RepoVitals } from '../src/github/client'

describe('statusLabel', () => {
  it('keeps ALIVE below 3 months', () => {
    expect(statusLabel('ALIVE', 0)).toBe('ALIVE')
    expect(statusLabel('ALIVE', 2)).toBe('ALIVE')
  })

  it('returns HIBERNATING for ALIVE at 3 to 11 months inclusive', () => {
    expect(statusLabel('ALIVE', 3)).toBe('HIBERNATING')
    expect(statusLabel('ALIVE', 7)).toBe('HIBERNATING')
    expect(statusLabel('ALIVE', 11)).toBe('HIBERNATING')
  })

  it('keeps ALIVE at 12 months', () => {
    expect(statusLabel('ALIVE', 12)).toBe('ALIVE')
  })

  it('never relabels DYING', () => {
    for (const m of [3, 12, 20]) expect(statusLabel('DYING', m)).toBe('DYING')
  })

  it('never relabels DEAD', () => {
    for (const m of [0, 11, 30]) expect(statusLabel('DEAD', m)).toBe('DEAD')
  })

  it('leaves classifyStatus unchanged for a 5-month non-archived repo', () => {
    const vitals: RepoVitals = {
      lastPushDate: '2024-01-01T00:00:00Z',
      archived: false,
      openIssueCount: 0,
      starCount: 0,
      monthsSinceLastPush: 5,
    }
    const status = classifyStatus(vitals)
    expect(status).toBe('ALIVE')
    expect(statusLabel(status, vitals.monthsSinceLastPush)).toBe('HIBERNATING')
  })
})
