import { describe, it, expect } from 'vitest'
import { parseRepoUrl } from '../src/lib/parseRepoUrl'

const OWNER = 'octocat'
const REPO = 'hello-world'
const expected = { owner: OWNER, repo: REPO }

describe('parseRepoUrl — valid URL forms', () => {
  it('parses plain HTTPS URL', () => {
    expect(parseRepoUrl(`https://github.com/${OWNER}/${REPO}`)).toEqual(expected)
  })

  it('parses HTTP URL', () => {
    expect(parseRepoUrl(`http://github.com/${OWNER}/${REPO}`)).toEqual(expected)
  })

  it('parses HTTPS with www subdomain', () => {
    expect(parseRepoUrl(`https://www.github.com/${OWNER}/${REPO}`)).toEqual(expected)
  })

  it('parses HTTPS URL with .git suffix', () => {
    expect(parseRepoUrl(`https://github.com/${OWNER}/${REPO}.git`)).toEqual(expected)
  })

  it('parses HTTPS URL with trailing slash', () => {
    expect(parseRepoUrl(`https://github.com/${OWNER}/${REPO}/`)).toEqual(expected)
  })

  it('parses HTTPS URL with /tree/main suffix', () => {
    expect(parseRepoUrl(`https://github.com/${OWNER}/${REPO}/tree/main`)).toEqual(expected)
  })

  it('parses HTTPS URL with deep extra path segments', () => {
    expect(parseRepoUrl(`https://github.com/${OWNER}/${REPO}/tree/main/src/index.ts`)).toEqual(expected)
  })

  it('parses HTTPS URL with /issues/1 suffix', () => {
    expect(parseRepoUrl(`https://github.com/${OWNER}/${REPO}/issues/1`)).toEqual(expected)
  })

  it('parses SSH URL with .git suffix', () => {
    expect(parseRepoUrl(`git@github.com:${OWNER}/${REPO}.git`)).toEqual(expected)
  })

  it('parses SSH URL without .git suffix', () => {
    expect(parseRepoUrl(`git@github.com:${OWNER}/${REPO}`)).toEqual(expected)
  })

  it('parses URL with leading and trailing whitespace', () => {
    expect(parseRepoUrl(`  https://github.com/${OWNER}/${REPO}  `)).toEqual(expected)
  })
})

describe('parseRepoUrl — invalid inputs', () => {
  it('returns null for empty string', () => {
    expect(parseRepoUrl('')).toBeNull()
  })

  it('returns null for plain text', () => {
    expect(parseRepoUrl('not a url')).toBeNull()
  })

  it('returns null for ftp:// URL', () => {
    expect(parseRepoUrl(`ftp://github.com/${OWNER}/${REPO}`)).toBeNull()
  })

  it('returns null for a different host (gitlab.com)', () => {
    expect(parseRepoUrl(`https://gitlab.com/${OWNER}/${REPO}`)).toBeNull()
  })

  it('returns null when repo segment is missing', () => {
    expect(parseRepoUrl(`https://github.com/${OWNER}`)).toBeNull()
  })

  it('returns null when both owner and repo are missing', () => {
    expect(parseRepoUrl('https://github.com/')).toBeNull()
  })

  it('returns null for bare github.com with no path', () => {
    expect(parseRepoUrl('https://github.com')).toBeNull()
  })

  it('returns null for URL without protocol', () => {
    expect(parseRepoUrl(`github.com/${OWNER}/${REPO}`)).toBeNull()
  })

  it('returns null when repo resolves to empty string after stripping .git', () => {
    // https://github.com/octocat/.git — repo part before .git is empty
    expect(parseRepoUrl(`https://github.com/${OWNER}/.git`)).toBeNull()
  })
})
