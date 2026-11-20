import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { parseRepoUrl } from '../src/lib/parseRepoUrl'

// A GitHub-safe name: starts and ends with alphanumeric, may contain hyphens in the middle.
// Kept short (2–22 chars) to avoid generating accidental regex edge-cases.
const githubNameArb = fc
  .tuple(
    fc.stringMatching(/^[a-zA-Z0-9]$/),               // first char
    fc.stringMatching(/^[a-zA-Z0-9-]{0,20}$/),        // middle (may be empty)
    fc.stringMatching(/^[a-zA-Z0-9]$/),               // last char
  )
  .map(([first, mid, last]) => `${first}${mid}${last}`)

/** Returns all URL syntactic variants that should map to the same owner/repo. */
function buildUrlVariants(owner: string, repo: string): string[] {
  return [
    `https://github.com/${owner}/${repo}`,
    `http://github.com/${owner}/${repo}`,
    `https://www.github.com/${owner}/${repo}`,
    `https://github.com/${owner}/${repo}.git`,
    `https://github.com/${owner}/${repo}/`,
    `https://github.com/${owner}/${repo}/tree/main`,
    `https://github.com/${owner}/${repo}/tree/main/src/index.ts`,
    `https://github.com/${owner}/${repo}/issues/1`,
    `git@github.com:${owner}/${repo}.git`,
    `git@github.com:${owner}/${repo}`,
  ]
}

describe('parseRepoUrl — property-based tests', () => {
  /**
   * Property 1 (Design §Correctness Properties, Property 1):
   *   For any string that is not a valid GitHub repo URL, parseRepoUrl returns null.
   *   It never throws.
   * Requirement: 1.2
   */
  it('Property 1: never throws and returns null for arbitrary non-GitHub strings', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        // Exclude strings that happen to already be valid GitHub URLs
        const looksLikeGitHub =
          /^https?:\/\/(?:www\.)?github\.com\//i.test(s) ||
          /^git@github\.com:/i.test(s)
        if (looksLikeGitHub) return

        let result: ReturnType<typeof parseRepoUrl>
        expect(() => {
          result = parseRepoUrl(s)
        }).not.toThrow()
        // After calling without throwing, result must be null for non-GitHub inputs
        expect(result!).toBeNull()
      }),
      { numRuns: 1000 },
    )
  })

  /**
   * Property 2 (Design §Correctness Properties, Property 2):
   *   For any valid owner/repo pair, every syntactic URL variant produces the
   *   same { owner, repo } output.
   * Requirement: 1.1
   */
  it('Property 2: all URL variants for the same owner/repo produce identical {owner, repo}', () => {
    fc.assert(
      fc.property(fc.tuple(githubNameArb, githubNameArb), ([owner, repo]) => {
        const variants = buildUrlVariants(owner, repo)
        for (const url of variants) {
          const result = parseRepoUrl(url)
          expect(result, `expected non-null for URL: ${url}`).not.toBeNull()
          expect(result!.owner, `owner mismatch for URL: ${url}`).toBe(owner)
          expect(result!.repo, `repo mismatch for URL: ${url}`).toBe(repo)
        }
      }),
      { numRuns: 300 },
    )
  })
})
