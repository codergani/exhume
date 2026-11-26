import { describe, it, expect } from 'vitest'
import {
  README_MAX_CHARS,
  buildReadmeExcerpt,
  buildReadmePayload,
  buildReadmeUrl,
} from '../src/lib/readme'
import type { ReadmeResult } from '../src/lib/readme'

describe('buildReadmeExcerpt', () => {
  it('uses 6000 as the default max', () => {
    expect(README_MAX_CHARS).toBe(6000)
  })

  it('does not truncate at 5999 and 6000 characters, truncates at 6001', () => {
    const a = buildReadmeExcerpt('a'.repeat(5999))
    const b = buildReadmeExcerpt('a'.repeat(6000))
    const c = buildReadmeExcerpt('a'.repeat(6001))
    expect([a.truncated, b.truncated, c.truncated]).toEqual([false, false, true])
    expect([a.text.length, b.text.length, c.text.length]).toEqual([5999, 6000, 6000])
  })

  it('drops a high surrogate left at the cut', () => {
    const r = buildReadmeExcerpt('a'.repeat(5999) + '😀')
    expect(r.truncated).toBe(true)
    expect(r.text.length).toBe(5999)
    expect(r.text).toBe('a'.repeat(5999))
  })

  it('keeps a full surrogate pair that fits', () => {
    const r = buildReadmeExcerpt('a'.repeat(5998) + '😀' + 'b')
    expect(r.truncated).toBe(true)
    expect(r.text).toBe('a'.repeat(5998) + '😀')
  })

  it('removes control characters but keeps newline, carriage return and tab', () => {
    const r = buildReadmeExcerpt('a\u0000b\u0001c\nd\re\tf\u001Fg')
    expect(r.text).toBe('abc\nd\re\tfg')
  })

  it('removes U+007F', () => {
    expect(buildReadmeExcerpt('a\u007Fb').text).toBe('ab')
  })

  it('reports empty for empty, whitespace-only and control-only input', () => {
    const expected = { text: '', truncated: false, empty: true }
    expect(buildReadmeExcerpt('')).toEqual(expected)
    expect(buildReadmeExcerpt(' \n\t ')).toEqual(expected)
    expect(buildReadmeExcerpt('\u0000\u0001\u007F')).toEqual(expected)
  })

  it('is deterministic', () => {
    const input = 'x\u0000y'.repeat(4000)
    expect(buildReadmeExcerpt(input)).toEqual(buildReadmeExcerpt(input))
  })
})

describe('buildReadmePayload', () => {
  it('maps available results', () => {
    const r: ReadmeResult = { status: 'available', text: 'hi', truncated: true, url: 'u' }
    expect(buildReadmePayload(r)).toEqual({ status: 'available', truncated: true, text: 'hi' })
  })

  it('maps unavailable, null and undefined to unavailable', () => {
    expect(buildReadmePayload({ status: 'unavailable', message: 'm' })).toEqual({ status: 'unavailable' })
    expect(buildReadmePayload(null)).toEqual({ status: 'unavailable' })
    expect(buildReadmePayload(undefined)).toEqual({ status: 'unavailable' })
  })

  it('never returns an empty string for available', () => {
    const r: ReadmeResult = { status: 'available', text: '', truncated: false, url: 'u' }
    expect(buildReadmePayload(r)).toEqual({ status: 'unavailable' })
  })
})

describe('buildReadmeUrl', () => {
  it('builds the plain URL', () => {
    expect(buildReadmeUrl('octo', 'cat')).toBe('https://github.com/octo/cat#readme')
  })

  it('encodes odd segments', () => {
    const url = buildReadmeUrl('a b', 'x/y')
    expect(url).toBe('https://github.com/a%20b/x%2Fy#readme')
    expect(url.startsWith('https://github.com/')).toBe(true)
  })
})
