/**
 * Parses any common GitHub repository URL form into { owner, repo }.
 * Returns null for any input that is not a valid GitHub repo URL.
 * Pure function — no side effects, no I/O, no imports from ui/github/ai.
 *
 * Accepted forms:
 *   https://github.com/owner/repo
 *   http://github.com/owner/repo
 *   https://www.github.com/owner/repo
 *   https://github.com/owner/repo.git
 *   https://github.com/owner/repo/
 *   https://github.com/owner/repo/tree/main/...
 *   https://github.com/owner/repo/issues/1
 *   git@github.com:owner/repo.git
 *   git@github.com:owner/repo
 */
export function parseRepoUrl(input: string): { owner: string; repo: string } | null {
  if (typeof input !== 'string') return null

  const trimmed = input.trim()

  // HTTPS / HTTP (with or without www.)
  // Matches: protocol://[www.]github.com/owner/repo[.git][/...rest]
  const httpsMatch = trimmed.match(
    /^https?:\/\/(?:www\.)?github\.com\/([^/#?]+)\/([^/#?.]+?)(?:\.git)?\/?(?:[#?/].*)?$/i,
  )
  if (httpsMatch) {
    const owner = httpsMatch[1]
    const repo = httpsMatch[2]
    if (owner && repo) return { owner, repo }
  }

  // SSH: git@github.com:owner/repo[.git]
  const sshMatch = trimmed.match(/^git@github\.com:([^/]+)\/([^/.]+?)(?:\.git)?$/i)
  if (sshMatch) {
    const owner = sshMatch[1]
    const repo = sshMatch[2]
    if (owner && repo) return { owner, repo }
  }

  return null
}
