import { GitHubRateLimitError, GitHubNotFoundError } from '../errors'

export interface RepoVitals {
  lastPushDate: string        // ISO 8601
  archived: boolean
  openIssueCount: number
  starCount: number
  monthsSinceLastPush: number // non-negative integer, computed at fetch time
}

/** Fetches repository vital signs from the GitHub REST v3 API (unauthenticated). */
export async function fetchRepoVitals(owner: string, repo: string): Promise<RepoVitals> {
  const url = `https://api.github.com/repos/${owner}/${repo}`
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

  if (res.status === 404) {
    throw new GitHubNotFoundError(url)
  }

  if (!res.ok) {
    throw new Error(`GitHub API error: ${res.status} ${res.statusText}`)
  }

  const data = await res.json() as {
    pushed_at: string
    archived: boolean
    open_issues_count: number
    stargazers_count: number
  }

  const monthsSinceLastPush = Math.floor(
    (Date.now() - new Date(data.pushed_at).getTime()) / (1000 * 60 * 60 * 24 * 30.44),
  )

  return {
    lastPushDate: data.pushed_at,
    archived: data.archived,
    openIssueCount: data.open_issues_count,
    starCount: data.stargazers_count,
    monthsSinceLastPush: Math.max(0, monthsSinceLastPush),
  }
}
