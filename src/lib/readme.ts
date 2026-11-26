/** Max length of a README excerpt, in UTF-16 code units. */
export const README_MAX_CHARS = 6000

// eslint-disable-next-line no-control-regex
const REMOVED_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g

/**
 * Removes control characters (except \n, \r, \t) and U+007F, then bounds the
 * text to `max` code units without leaving a trailing lone high surrogate.
 */
export function buildReadmeExcerpt(
  raw: string,
  max: number = README_MAX_CHARS,
): { text: string; truncated: boolean; empty: boolean } {
  const cleaned = raw.replace(REMOVED_CHARS, '')
  if (cleaned.trim() === '') {
    return { text: '', truncated: false, empty: true }
  }
  if (cleaned.length > max) {
    let text = cleaned.slice(0, max)
    const last = text.charCodeAt(text.length - 1)
    if (last >= 0xd800 && last <= 0xdbff) {
      text = text.slice(0, -1)
    }
    return { text, truncated: true, empty: false }
  }
  return { text: cleaned, truncated: false, empty: false }
}

/** The README step's outcome, held by the app outside AppState. */
export type ReadmeResult =
  | { status: 'available'; text: string; truncated: boolean; url: string }
  | { status: 'unavailable'; message: string }

/** The shape sent to the AI under the `readme` key; never carries an empty string. */
export type ReadmePayload =
  | { status: 'available'; truncated: boolean; text: string }
  | { status: 'unavailable' }

export function buildReadmePayload(
  result: ReadmeResult | null | undefined,
): ReadmePayload {
  if (!result || result.status !== 'available' || result.text === '') {
    return { status: 'unavailable' }
  }
  return { status: 'available', truncated: result.truncated, text: result.text }
}

export function buildReadmeUrl(owner: string, repo: string): string {
  return `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}#readme`
}
