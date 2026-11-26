import { describe, expect, it } from 'vitest'
import { rejectedCaseCount, savedCases } from '../src/cases'
import { classifyStatus } from '../src/lib/classifyStatus'
import { statusLabel } from '../src/lib/statusLabel'

function collectStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value)
  else if (Array.isArray(value)) value.forEach((v) => collectStrings(v, out))
  else if (typeof value === 'object' && value !== null) {
    Object.values(value).forEach((v) => collectStrings(v, out))
  }
  return out
}

const SECRET_PATTERNS = [/AIza[0-9A-Za-z_-]{30,}/, /ghp_/, /-----BEGIN/, /[\w.+-]+@[\w-]+\.[\w.-]+/]

describe('shipped case files', () => {
  it('rejects none of the bundled files', () => {
    expect(rejectedCaseCount).toBe(0)
  })

  it('ships between 1 and 3 cases', () => {
    expect(savedCases.length).toBeGreaterThanOrEqual(1)
    expect(savedCases.length).toBeLessThanOrEqual(3)
  })

  it('has unique ids', () => {
    const ids = savedCases.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('never matches /exhume/i in owner, repo or the case button text', () => {
    for (const c of savedCases) {
      const label = statusLabel(classifyStatus(c.vitals), c.vitals.monthsSinceLastPush)
      const buttonText = `${c.owner}/${c.repo} · ${label} · captured ${c.capturedAt.slice(0, 10)}`
      expect(c.owner).not.toMatch(/exhume/i)
      expect(c.repo).not.toMatch(/exhume/i)
      expect(buttonText).not.toMatch(/exhume/i)
    }
  })

  it('contains no secrets or email addresses in any string', () => {
    for (const c of savedCases) {
      for (const s of collectStrings(c)) {
        for (const p of SECRET_PATTERNS) expect(s).not.toMatch(p)
      }
    }
  })

  it('has license, source and capturedAt on every case', () => {
    for (const c of savedCases) {
      expect(c.license.trim()).not.toBe('')
      expect(c.source.kind).toBeTruthy()
      expect(c.source.readmeOrigin).toBeTruthy()
      expect(c.capturedAt).toBeTruthy()
    }
  })

  it('keeps every README within 6000 characters', () => {
    for (const c of savedCases) expect(c.readme.text.length).toBeLessThanOrEqual(6000)
  })
})

describe('placeholder-lantern', () => {
  const c = savedCases.find((s) => s.id === 'placeholder-lantern')

  it('is present and fictional', () => {
    expect(c).toBeDefined()
    expect(c?.source.kind).toBe('fictional')
  })

  it('is ALIVE and labelled HIBERNATING', () => {
    expect(c).toBeDefined()
    if (!c) return
    expect(classifyStatus(c.vitals)).toBe('ALIVE')
    expect(statusLabel(classifyStatus(c.vitals), c.vitals.monthsSinceLastPush)).toBe('HIBERNATING')
  })

  it('uses ALIVE wording in the report text', () => {
    expect(c).toBeDefined()
    if (!c) return
    const text = [
      c.report.causeOfDeath,
      ...c.report.steps.flatMap((s) => [s.action, s.rationale]),
    ].join('\n')
    expect(text).not.toMatch(/dead|death|abandon/i)
    expect(text).not.toMatch(/\b0 months?\b/)
  })
})
