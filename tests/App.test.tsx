// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AutopsyAiError, AutopsySchemaError, GitHubRateLimitError } from '../src/errors'
import type { RepoVitals } from '../src/github/client'

vi.mock('../src/github/client', () => ({ fetchRepoVitals: vi.fn() }))
vi.mock('../src/ai/provider', () => ({ runAutopsy: vi.fn() }))

import App from '../src/App'
import { fetchRepoVitals } from '../src/github/client'
import { runAutopsy } from '../src/ai/provider'

const fetchMock = vi.mocked(fetchRepoVitals)
const autopsyMock = vi.mocked(runAutopsy)

const vitals: RepoVitals = {
  lastPushDate: '2021-03-15T10:22:00Z',
  archived: false,
  openIssueCount: 142,
  starCount: 831,
  monthsSinceLastPush: 50,
}

const report = {
  causeOfDeath: 'Neglect and dependency rot.',
  severity: 'critical' as const,
  steps: [
    { order: 1, action: 'Assess community interest', rationale: 'Stars indicate demand.' },
    { order: 2, action: 'Upgrade deps', rationale: 'Old deps block modern tooling.' },
    { order: 3, action: 'Fork or archive', rationale: 'No maintainer response expected.' },
  ],
  generatedAt: '2025-01-01T00:00:00.000Z',
}

function submit(url: string) {
  fireEvent.change(screen.getByLabelText(/repository url/i), { target: { value: url } })
  fireEvent.click(screen.getByRole('button', { name: /exhume/i }))
}

beforeEach(() => {
  vi.clearAllMocks()
  // Reduced motion: no stage pause, results shown instantly.
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: true,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  })
})

describe('App state machine', () => {
  it('IDLE -> RESULTS: shows vitals, progress lines and the autopsy', async () => {
    fetchMock.mockResolvedValue(vitals)
    autopsyMock.mockResolvedValue(report)
    render(<App />)

    submit('https://github.com/octocat/hello-world.git')

    expect(await screen.findByText(/Neglect and dependency rot/)).not.toBeNull()
    expect(fetchMock).toHaveBeenCalledWith('octocat', 'hello-world')
    expect(screen.getByText('831')).not.toBeNull()
    expect(screen.getByText('DEAD')).not.toBeNull()
    expect(screen.getByText(/consulting the spirits/)).not.toBeNull()
    expect(screen.getByRole('button', { name: /analyse another/i })).not.toBeNull()
  })

  it('invalid URL: shows an in-theme error and calls no API', () => {
    render(<App />)
    submit('not a url')

    expect(screen.getByRole('alert').textContent).toMatch(/not a grave/i)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(autopsyMock).not.toHaveBeenCalled()
  })

  it('rate limit: shows the reset time and Start over returns to IDLE', async () => {
    const resetAt = new Date('2025-01-01T01:00:00Z')
    fetchMock.mockRejectedValue(new GitHubRateLimitError(resetAt))
    render(<App />)
    submit('https://github.com/octocat/hello-world')

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain(resetAt.toLocaleString())
    expect(autopsyMock).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /start over/i }))
    expect(screen.getByLabelText(/repository url/i)).not.toBeNull()
  })

  it('AI transport error: keeps vitals, Retry re-consults without re-fetching GitHub', async () => {
    fetchMock.mockResolvedValue(vitals)
    autopsyMock
      .mockRejectedValueOnce(new AutopsyAiError('AI request failed: offline'))
      .mockResolvedValueOnce(report)
    render(<App />)
    submit('https://github.com/octocat/hello-world')

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('AI request failed: offline')
    expect(screen.getByText('831')).not.toBeNull() // vitals stay on screen

    fireEvent.click(screen.getByRole('button', { name: /retry/i }))

    expect(await screen.findByText(/Neglect and dependency rot/)).not.toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(autopsyMock).toHaveBeenCalledTimes(2)
  })

  it('schema error: shows the deterministic fallback with the marker line', async () => {
    fetchMock.mockResolvedValue(vitals)
    autopsyMock.mockRejectedValue(new AutopsySchemaError({ bad: true }))
    render(<App />)
    submit('https://github.com/octocat/hello-world')

    const marker = 'the spirits are silent \u2014 showing instrument readings only.'
    expect(await screen.findByText(new RegExp(marker.replace('.', '\\.')))).not.toBeNull()
    expect(screen.getByText(/No commits in 50 months/)).not.toBeNull()
    expect(screen.getByText('831')).not.toBeNull()
  })
})