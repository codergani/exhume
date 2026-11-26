import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { buildReadmeExcerpt } from '../src/lib/readme'

const RUNS = 400

const inputArb = fc.oneof(
  fc.string({ unit: 'binary', maxLength: 12000 }),
  fc.string({ unit: 'grapheme', maxLength: 12000 }),
  fc
    .tuple(
      fc.constantFrom('a', '\u0000', '\n', '😀', '\u007F', ' ', 'é'),
      fc.integer({ min: 5990, max: 6010 }),
      fc.string({ unit: 'binary', maxLength: 20 }),
    )
    .map(([ch, n, tail]) => ch.repeat(n) + tail),
)

describe('buildReadmeExcerpt — property-based test', () => {
  /**
   * Feature: readme-explainer, Property 1: excerpt is bounded and is a prefix
   * of the cleaned input.
   * **Validates: Requirements 2.1, 2.7**
   */
  it('Property 1: text is at most 6000 long and a prefix of the cleaned input', () => {
    fc.assert(
      fc.property(inputArb, (s) => {
        // eslint-disable-next-line no-control-regex
        const cleaned = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
        const { text } = buildReadmeExcerpt(s)
        expect(text.length).toBeLessThanOrEqual(6000)
        expect(cleaned.startsWith(text)).toBe(true)
      }),
      { numRuns: RUNS },
    )
  })
})
