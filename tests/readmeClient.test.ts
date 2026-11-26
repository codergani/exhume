import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchReadme } from '../src/github/readme'
import { GitHubRateLimitError } from '../src/errors'

const NOW = new Date('2025-01-01T00:00:00Z').getTime()

function mockFetch(status: number, body = '', headers: Record<string, string> = {}) {
  const fn = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    headers: new Headers(headers),
    text: () => Promise.resolve(body),
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

beforeEach(() => {
  vi.unstubAllGlobals()
  vi.setSystemTime(NOW)
})

describe('fetchReadme', () => {
  it('requests the readme endpoint with only the raw Accept header', async () => {
    const fn = mockFetch(200, '# Hello')
    await fetchReadme('octocat', 'hello-world')

    const [url, init] = fn.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.github.com/repos/octocat/hello-world/readme')
    expect(init.headers).toEqual({ Accept: 'application/vnd.github.raw+json' })
  })

  it('returns the response text on 200', async () => {
    mockFetch(200, '# Hello')
    await expect(fetchReadme('octocat', 'hello-world')).resolves.toBe('# Hello')
  })

  it('resolves to null on 404', async () => {
    mockFetch(404)
    await expect(fetchReadme('octocat', 'hello-world')).resolves.toBeNull()
  })

  it('throws GitHubRateLimitError with resetAt on 403 with header', async () => {
    const resetEpoch = Math.floor(new Date('2025-01-01T01:00:00Z').getTime() / 1000)
    mockFetch(403, '', { 'X-RateLimit-Reset': String(resetEpoch) })

    const err = await fetchReadme('octocat', 'x').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(GitHubRateLimitError)
    expect((err as GitHubRateLimitError).resetAt).toEqual(new Date(resetEpoch * 1000))
  })

  it('throws GitHubRateLimitError with a future date on 403 without header', async () => {
    mockFetch(403)

    const err = await fetchReadme('octocat', 'x').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(GitHubRateLimitError)
    const resetAt = (err as GitHubRateLimitError).resetAt
    expect(Number.isNaN(resetAt.getTime())).toBe(false)
    expect(resetAt.getTime()).toBeGreaterThan(Date.now())
  })

  it('throws GitHubRateLimitError on 429', async () => {
    mockFetch(429)
    await expect(fetchReadme('octocat', 'x')).rejects.toBeInstanceOf(GitHubRateLimitError)
  })

  it('throws a generic Error on 500', async () => {
    mockFetch(500)
    const err = await fetchReadme('octocat', 'x').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(Error)
    expect(err).not.toBeInstanceOf(GitHubRateLimitError)
    expect((err as Error).message).toContain('500')
  })

  it('propagates a network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network down')))
    const err = await fetchReadme('octocat', 'x').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(Error)
  })
})
