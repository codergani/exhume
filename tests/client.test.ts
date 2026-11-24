import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchRepoVitals } from '../src/github/client'
import { GitHubRateLimitError, GitHubNotFoundError } from '../src/errors'

// Fixed "now" so monthsSinceLastPush is deterministic
const NOW = new Date('2025-01-01T00:00:00Z').getTime()

function mockFetch(status: number, body: unknown, headers: Record<string, string> = {}) {
  const responseHeaders = new Headers(headers)
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    headers: responseHeaders,
    json: () => Promise.resolve(body),
  }))
}

beforeEach(() => {
  vi.unstubAllGlobals()
  vi.setSystemTime(NOW)
})

describe('fetchRepoVitals', () => {
  it('maps all five fields correctly on 200', async () => {
    mockFetch(200, {
      pushed_at: '2024-07-01T00:00:00Z',   // ~6 months before 2025-01-01
      archived: false,
      open_issues_count: 42,
      stargazers_count: 831,
    })

    const vitals = await fetchRepoVitals('octocat', 'hello-world')

    expect(vitals.lastPushDate).toBe('2024-07-01T00:00:00Z')
    expect(vitals.archived).toBe(false)
    expect(vitals.openIssueCount).toBe(42)
    expect(vitals.starCount).toBe(831)
    // 184 days / 30.44 ≈ 6 months
    expect(vitals.monthsSinceLastPush).toBe(6)
  })

  it('handles archived: true', async () => {
    mockFetch(200, {
      pushed_at: '2020-01-01T00:00:00Z',
      archived: true,
      open_issues_count: 0,
      stargazers_count: 10,
    })
    const vitals = await fetchRepoVitals('octocat', 'archived-repo')
    expect(vitals.archived).toBe(true)
  })

  it('throws GitHubRateLimitError on 403 with X-RateLimit-Reset header', async () => {
    const resetEpoch = Math.floor(new Date('2025-01-01T01:00:00Z').getTime() / 1000)
    mockFetch(403, {}, { 'X-RateLimit-Reset': String(resetEpoch) })

    await expect(fetchRepoVitals('octocat', 'x')).rejects.toBeInstanceOf(GitHubRateLimitError)

    try {
      await fetchRepoVitals('octocat', 'x')
    } catch (e) {
      expect(e).toBeInstanceOf(GitHubRateLimitError)
      expect((e as GitHubRateLimitError).resetAt).toEqual(new Date(resetEpoch * 1000))
    }
  })

  it('throws GitHubRateLimitError on 429', async () => {
    mockFetch(429, {})
    await expect(fetchRepoVitals('octocat', 'x')).rejects.toBeInstanceOf(GitHubRateLimitError)
  })

  it('throws GitHubNotFoundError on 404', async () => {
    mockFetch(404, {})
    await expect(fetchRepoVitals('octocat', 'nonexistent')).rejects.toBeInstanceOf(GitHubNotFoundError)
  })

  it('throws a generic Error on other non-2xx statuses', async () => {
    mockFetch(500, {})
    await expect(fetchRepoVitals('octocat', 'x')).rejects.toThrow('500')
  })
})
