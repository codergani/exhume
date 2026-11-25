import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchForks } from '../src/github/forks'
import { GitHubRateLimitError } from '../src/errors'

const NOW = new Date('2025-01-01T00:00:00Z').getTime()

function mockFetch(status: number, body: unknown, headers: Record<string, string> = {}) {
  const fn = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    headers: new Headers(headers),
    json: () => Promise.resolve(body),
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

function item(login: string, pushedAt: string | null, stars: number, archived = false) {
  return {
    owner: { login },
    name: 'hello-world',
    html_url: `https://github.com/${login}/hello-world`,
    stargazers_count: stars,
    pushed_at: pushedAt,
    archived,
  }
}

beforeEach(() => {
  vi.unstubAllGlobals()
  vi.setSystemTime(NOW)
})

describe('fetchForks', () => {
  it('maps all fields correctly for two forks on 200', async () => {
    mockFetch(200, [
      item('alice', '2024-12-01T00:00:00Z', 50),
      item('bob', '2024-06-01T00:00:00Z', 7, true),
    ])

    const forks = await fetchForks('octocat', 'hello-world')

    expect(forks).toEqual([
      {
        owner: 'alice',
        name: 'hello-world',
        htmlUrl: 'https://github.com/alice/hello-world',
        starCount: 50,
        lastPushDate: '2024-12-01T00:00:00Z',
        archived: false,
      },
      {
        owner: 'bob',
        name: 'hello-world',
        htmlUrl: 'https://github.com/bob/hello-world',
        starCount: 7,
        lastPushDate: '2024-06-01T00:00:00Z',
        archived: true,
      },
    ])
  })

  it('requests the forks endpoint with sort, per_page and Accept header', async () => {
    const fn = mockFetch(200, [])
    await fetchForks('octocat', 'hello-world')

    const [url, init] = fn.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/repos/octocat/hello-world/forks')
    expect(url).toContain('sort=stargazers')
    expect(url).toContain('per_page=30')
    expect(init.headers).toEqual({ Accept: 'application/vnd.github+json' })
  })

  it('throws GitHubRateLimitError with resetAt on 403', async () => {
    const resetEpoch = Math.floor(new Date('2025-01-01T01:00:00Z').getTime() / 1000)
    mockFetch(403, {}, { 'X-RateLimit-Reset': String(resetEpoch) })

    const err = await fetchForks('octocat', 'x').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(GitHubRateLimitError)
    expect((err as GitHubRateLimitError).resetAt).toEqual(new Date(resetEpoch * 1000))
  })

  it('throws GitHubRateLimitError on 429', async () => {
    mockFetch(429, {})
    await expect(fetchForks('octocat', 'x')).rejects.toBeInstanceOf(GitHubRateLimitError)
  })

  it('throws a generic Error on 500', async () => {
    mockFetch(500, {})
    const err = await fetchForks('octocat', 'x').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(Error)
    expect(err).not.toBeInstanceOf(GitHubRateLimitError)
    expect((err as Error).message).toContain('500')
  })

  it('skips items with null pushed_at', async () => {
    mockFetch(200, [item('ghost', null, 3), item('alice', '2024-12-01T00:00:00Z', 50)])
    const forks = await fetchForks('octocat', 'hello-world')
    expect(forks.map((f) => f.owner)).toEqual(['alice'])
  })
})
