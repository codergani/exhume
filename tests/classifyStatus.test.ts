import { describe, it, expect } from 'vitest'
import { classifyStatus } from '../src/lib/classifyStatus'
import type { RepoVitals } from '../src/github/client'

function vitals(months: number, archived = false): RepoVitals {
  return {
    lastPushDate: '2020-01-01T00:00:00Z',
    archived,
    openIssueCount: 0,
    starCount: 0,
    monthsSinceLastPush: months,
  }
}

describe('classifyStatus — boundary examples', () => {
  it('0 months, not archived => ALIVE', () => {
    expect(classifyStatus(vitals(0))).toBe('ALIVE')
  })

  it('11 months, not archived => ALIVE', () => {
    expect(classifyStatus(vitals(11))).toBe('ALIVE')
  })

  it('12 months, not archived => DYING', () => {
    expect(classifyStatus(vitals(12))).toBe('DYING')
  })

  it('23 months, not archived => DYING', () => {
    expect(classifyStatus(vitals(23))).toBe('DYING')
  })

  it('24 months, not archived => DEAD', () => {
    expect(classifyStatus(vitals(24))).toBe('DEAD')
  })

  it('50 months, not archived => DEAD', () => {
    expect(classifyStatus(vitals(50))).toBe('DEAD')
  })

  it('0 months, archived => DEAD', () => {
    expect(classifyStatus(vitals(0, true))).toBe('DEAD')
  })

  it('11 months, archived => DEAD (archived overrides month range)', () => {
    expect(classifyStatus(vitals(11, true))).toBe('DEAD')
  })

  it('23 months, archived => DEAD', () => {
    expect(classifyStatus(vitals(23, true))).toBe('DEAD')
  })
})
