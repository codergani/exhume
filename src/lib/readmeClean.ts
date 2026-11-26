const LINKED_IMAGE = /\[!\[[^[\]]*\]\([^()]*\)\]\([^()]*\)/g
const IMAGE = /!\[[^[\]]*\]\([^()]*\)/g
const LINK = /\[([^[\]]*)\]\([^()]*\)/g
const HTML_TAG = /<\/?[A-Za-z][A-Za-z0-9-]*(?:\s[^<>]*)?\/?>/g
const HEADING_MARKER = /^[ \t]{0,3}#{1,6}[ \t]+/gm
const BLANK_RUN = /\n{3,}/g

function removeHtmlComments(s: string): string {
  let out = ''
  let pos = 0
  for (;;) {
    const start = s.indexOf('<!--', pos)
    if (start === -1) break
    const end = s.indexOf('-->', start + 4)
    if (end === -1) break
    out += s.slice(pos, start)
    pos = end + 3
  }
  return out + s.slice(pos)
}

/**
 * Removes HTML, badges and link markup from README text and tidies blank lines.
 * Rules, in order: normalise line endings; remove HTML comments; remove linked
 * images; remove images; convert links to their text; remove HTML tags; strip
 * heading markers; trim trailing whitespace per line; collapse 2 or more blank
 * lines to 1; trim the whole text.
 * Output is plain text. Not a security measure.
 */
export function cleanReadmeText(raw: string): string {
  if (typeof raw !== 'string') return ''
  let s = raw.replace(/\r\n?/g, '\n')
  s = removeHtmlComments(s)
  s = s.replace(LINKED_IMAGE, '')
  s = s.replace(IMAGE, '')
  s = s.replace(LINK, '$1')
  s = s.replace(HTML_TAG, '')
  s = s.replace(HEADING_MARKER, '')
  s = s
    .split('\n')
    .map((l) => l.trimEnd())
    .join('\n')
  s = s.replace(BLANK_RUN, '\n\n')
  return s.trim()
}
