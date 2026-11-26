import { GitHubRateLimitError } from '../errors'

/**
 * Fetches the raw README text of a repository (unauthenticated). Returns null when the repo has no README.
 * The raw text is read fully here and bounded later by the excerpt builder.
 */
export async function fetchReadme(owner: string, repo: string): Promise<string | null> {
  const url = `https://api.github.com/repos/${owner}/${repo}/readme`
  const res = await fetch(url, {
    headers: { Accept: 'application/vnd.github.raw+json' },
  })

  if (res.status === 404) {
    return null
  }

  if (res.status === 403 || res.status === 429) {
    const resetHeader = res.headers.get('X-RateLimit-Reset')
    const resetAt = resetHeader
      ? new Date(parseInt(resetHeader, 10) * 1000)
      : new Date(Date.now() + 60_000)
    throw new GitHubRateLimitError(resetAt)
  }

  if (!res.ok) {
    throw new Error(`GitHub API error: ${res.status} ${res.statusText}`)
  }

  return await res.text()
}
