import type { ForkCandidate } from '../lib/forks'
import { GitHubRateLimitError } from '../errors'

interface ForkItem {
  owner: { login: string }
  name: string
  html_url: string
  stargazers_count: number
  pushed_at: string | null
  archived: boolean
}

/** Fetches the top forks (by stars) of a repository from the GitHub REST v3 API (unauthenticated). */
export async function fetchForks(owner: string, repo: string): Promise<ForkCandidate[]> {
  const url = `https://api.github.com/repos/${owner}/${repo}/forks?sort=stargazers&per_page=30`
  const res = await fetch(url, {
    headers: { Accept: 'application/vnd.github+json' },
  })

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

  const items = await res.json() as ForkItem[]

  return items
    .filter((item) => item.pushed_at !== null)
    .map((item) => ({
      owner: item.owner.login,
      name: item.name,
      htmlUrl: item.html_url,
      starCount: item.stargazers_count,
      lastPushDate: item.pushed_at as string,
      archived: item.archived,
    }))
}
