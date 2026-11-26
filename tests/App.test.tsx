// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AutopsyAiError, AutopsySchemaError, GitHubRateLimitError } from '../src/errors'
import type { RepoVitals } from '../src/github/client'

vi.mock('../src/github/client', () => ({ fetchRepoVitals: vi.fn() }))
vi.mock('../src/ai/provider', () => ({ runAutopsy: vi.fn() }))
vi.mock('../src/github/forks', () => ({ fetchForks: vi.fn() }))
vi.mock('../src/github/readme', () => ({ fetchReadme: vi.fn() }))

import App from '../src/App'
import { fetchRepoVitals } from '../src/github/client'
import { runAutopsy } from '../src/ai/provider'
import { fetchForks } from '../src/github/forks'
import { fetchReadme } from '../src/github/readme'
import type { ForkCandidate } from '../src/lib/forks'

const fetchMock = vi.mocked(fetchRepoVitals)
const autopsyMock = vi.mocked(runAutopsy)
const forksMock = vi.mocked(fetchForks)
const readmeMock = vi.mocked(fetchReadme)

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
  forksMock.mockResolvedValue([])
  readmeMock.mockResolvedValue(null)
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
describe('App fork finder', () => {
  const recent = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()
  const stale = new Date(Date.now() - 800 * 24 * 3600 * 1000).toISOString()

  function fork(owner: string, stars: number, overrides: Partial<ForkCandidate> = {}): ForkCandidate {
    return {
      owner,
      name: 'hello-world',
      htmlUrl: `https://github.com/${owner}/hello-world`,
      starCount: stars,
      lastPushDate: recent,
      archived: false,
      ...overrides,
    }
  }

  it('DEAD repo: living forks appear before the report and reach runAutopsy', async () => {
    fetchMock.mockResolvedValue(vitals)
    forksMock.mockResolvedValue([fork('alice', 40), fork('bob', 10)])
    autopsyMock.mockResolvedValue(report)
    render(<App />)
    submit('https://github.com/octocat/hello-world')

    const reportNode = await screen.findByText(/Neglect and dependency rot/)
    const link = screen.getByRole('link', { name: /alice\/hello-world/ })
    expect(forksMock).toHaveBeenCalledWith('octocat', 'hello-world')
    expect(
      link.compareDocumentPosition(reportNode) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    const summary = autopsyMock.mock.calls[0][2]
    expect(summary).toMatchObject({ status: 'available', livingCount: 2 })
  })

  it('ALIVE repo: fetchForks is not called and the summary is unavailable', async () => {
    fetchMock.mockResolvedValue({ ...vitals, monthsSinceLastPush: 3, lastPushDate: recent })
    autopsyMock.mockResolvedValue(report)
    render(<App />)
    submit('https://github.com/octocat/hello-world')

    await screen.findByText(/Neglect and dependency rot/)
    expect(forksMock).not.toHaveBeenCalled()
    expect(autopsyMock.mock.calls[0][2]).toEqual({ status: 'unavailable' })
  })

  it('forks failure: one note line, report still shown, no error banner', async () => {
    fetchMock.mockResolvedValue(vitals)
    forksMock.mockRejectedValue(new Error('boom'))
    autopsyMock.mockResolvedValue(report)
    render(<App />)
    submit('https://github.com/octocat/hello-world')

    await screen.findByText(/Neglect and dependency rot/)
    expect(screen.getAllByText(/could not reach the fork registry/)).toHaveLength(1)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(autopsyMock.mock.calls[0][2]).toEqual({ status: 'unavailable' })
  })

  it('forks rate limit: the line shows the reset time and the report still appears', async () => {
    const resetAt = new Date('2025-01-01T01:00:00Z')
    fetchMock.mockResolvedValue(vitals)
    forksMock.mockRejectedValue(new GitHubRateLimitError(resetAt))
    autopsyMock.mockResolvedValue(report)
    render(<App />)
    submit('https://github.com/octocat/hello-world')

    await screen.findByText(/Neglect and dependency rot/)
    expect(screen.getByText(new RegExp(resetAt.toLocaleTimeString()))).not.toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('AI Retry reuses the held fork result and never calls fetchForks again', async () => {
    fetchMock.mockResolvedValue(vitals)
    forksMock.mockResolvedValue([fork('alice', 40)])
    autopsyMock
      .mockRejectedValueOnce(new AutopsyAiError('AI request failed: offline'))
      .mockResolvedValueOnce(report)
    render(<App />)
    submit('https://github.com/octocat/hello-world')

    await screen.findByRole('alert')
    expect(screen.getByRole('link', { name: /alice\/hello-world/ })).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))

    expect(await screen.findByText(/Neglect and dependency rot/)).not.toBeNull()
    expect(forksMock).toHaveBeenCalledTimes(1)
    expect(autopsyMock).toHaveBeenCalledTimes(2)
    expect(autopsyMock.mock.calls[1][2]).toEqual(autopsyMock.mock.calls[0][2])
    expect(autopsyMock.mock.calls[1][2]).toMatchObject({ status: 'available', livingCount: 1 })
  })

  it('schema error: the fallback report names the top fork', async () => {
    fetchMock.mockResolvedValue(vitals)
    forksMock.mockResolvedValue([fork('alice', 40), fork('bob', 10)])
    autopsyMock.mockRejectedValue(new AutopsySchemaError({ bad: true }))
    render(<App />)
    submit('https://github.com/octocat/hello-world')

    expect(await screen.findByText(/the spirits are silent/)).not.toBeNull()
    expect(screen.getByText(/living fork alice\/hello-world/)).not.toBeNull()
  })

  it('zero living forks: shows the no-living-forks line and the report', async () => {
    fetchMock.mockResolvedValue(vitals)
    forksMock.mockResolvedValue([fork('alice', 40, { archived: true }), fork('bob', 10, { lastPushDate: stale })])
    autopsyMock.mockResolvedValue(report)
    render(<App />)
    submit('https://github.com/octocat/hello-world')

    expect(await screen.findByText(/Neglect and dependency rot/)).not.toBeNull()
    expect(screen.getByText(/no living forks found/)).not.toBeNull()
    expect(autopsyMock.mock.calls[0][2]).toMatchObject({ status: 'available', livingCount: 0 })
  })
})

describe('App readme explainer', () => {
  const recent = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()
  const MISSING = 'no readme was left with these remains.'

  it('DEAD repo: the README panel follows the report and links to the original', async () => {
    fetchMock.mockResolvedValue(vitals)
    readmeMock.mockResolvedValue('# Widget\n\nA tiny library.')
    autopsyMock.mockResolvedValue(report)
    render(<App />)
    submit('https://github.com/octocat/hello-world')

    const reportNode = await screen.findByText(/Neglect and dependency rot/)
    const readmeNode = await screen.findByText(/A tiny library\./)
    expect(readmeMock).toHaveBeenCalledWith('octocat', 'hello-world')
    expect(
      reportNode.compareDocumentPosition(readmeNode) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    const link = screen.getByRole('link', { name: /original readme/i })
    expect(link.getAttribute('href')).toBe('https://github.com/octocat/hello-world#readme')
    expect(link.getAttribute('rel')).toContain('noopener')
  })

  it('the overview is shown inside the report, before CAUSE OF DEATH', async () => {
    fetchMock.mockResolvedValue(vitals)
    readmeMock.mockResolvedValue('# Widget\n\nA tiny library.')
    autopsyMock.mockResolvedValue({
      ...report,
      overview: { purpose: 'Parses widgets.', audience: 'Widget authors.', quickStart: ['Install it.'] },
    })
    render(<App />)
    submit('https://github.com/octocat/hello-world')

    const node = await screen.findByText(/Purpose: Parses widgets\./)
    const text = node.textContent ?? ''
    expect(text.indexOf('Purpose: Parses widgets.')).toBeGreaterThanOrEqual(0)
    expect(text.indexOf('Purpose: Parses widgets.')).toBeLessThan(text.indexOf('CAUSE OF DEATH'))
  })

  it('ALIVE repo: fetchReadme is called and fetchForks is not', async () => {
    fetchMock.mockResolvedValue({ ...vitals, monthsSinceLastPush: 3, lastPushDate: recent })
    autopsyMock.mockResolvedValue(report)
    render(<App />)
    submit('https://github.com/octocat/hello-world')

    await screen.findByText(/Neglect and dependency rot/)
    expect(readmeMock).toHaveBeenCalledTimes(1)
    expect(forksMock).not.toHaveBeenCalled()
  })

  it('missing README: one line, report still shown, no alert', async () => {
    fetchMock.mockResolvedValue(vitals)
    readmeMock.mockResolvedValue(null)
    autopsyMock.mockResolvedValue(report)
    render(<App />)
    submit('https://github.com/octocat/hello-world')

    await screen.findByText(/Neglect and dependency rot/)
    expect(screen.getAllByText(MISSING)).toHaveLength(1)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('fetch failure: one line, report still shown', async () => {
    fetchMock.mockResolvedValue(vitals)
    readmeMock.mockRejectedValue(new Error('boom'))
    autopsyMock.mockResolvedValue(report)
    render(<App />)
    submit('https://github.com/octocat/hello-world')

    await screen.findByText(/Neglect and dependency rot/)
    expect(screen.getAllByText(/could not read the readme\./)).toHaveLength(1)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('rate limit: the line shows the reset time and the report appears', async () => {
    const resetAt = new Date('2025-01-01T01:00:00Z')
    fetchMock.mockResolvedValue(vitals)
    readmeMock.mockRejectedValue(new GitHubRateLimitError(resetAt))
    autopsyMock.mockResolvedValue(report)
    render(<App />)
    submit('https://github.com/octocat/hello-world')

    await screen.findByText(/Neglect and dependency rot/)
    expect(screen.getByText(/readme vault is sealed until/).textContent).toContain(
      resetAt.toLocaleTimeString(),
    )
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('AI Retry reuses the held README: fetchReadme is called once and the payload is equal', async () => {
    fetchMock.mockResolvedValue(vitals)
    readmeMock.mockResolvedValue('# Widget\n\nA tiny library.')
    autopsyMock
      .mockRejectedValueOnce(new AutopsyAiError('AI request failed: offline'))
      .mockResolvedValueOnce(report)
    render(<App />)
    submit('https://github.com/octocat/hello-world')

    await screen.findByRole('alert')
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))

    expect(await screen.findByText(/Neglect and dependency rot/)).not.toBeNull()
    expect(readmeMock).toHaveBeenCalledTimes(1)
    expect(autopsyMock).toHaveBeenCalledTimes(2)
    expect(autopsyMock.mock.calls[1][3]).toEqual(autopsyMock.mock.calls[0][3])
  })

  it('runAutopsy receives an available payload when the README exists', async () => {
    fetchMock.mockResolvedValue(vitals)
    readmeMock.mockResolvedValue('# Widget\n\nA tiny library.')
    autopsyMock.mockResolvedValue(report)
    render(<App />)
    submit('https://github.com/octocat/hello-world')

    await screen.findByText(/Neglect and dependency rot/)
    expect(autopsyMock.mock.calls[0][3]).toEqual({
      status: 'available',
      truncated: false,
      text: '# Widget\n\nA tiny library.',
    })
  })

  it('runAutopsy receives an unavailable payload when the README failed, and no panel text is shown', async () => {
    fetchMock.mockResolvedValue(vitals)
    readmeMock.mockRejectedValue(new Error('boom'))
    autopsyMock.mockResolvedValue(report)
    render(<App />)
    submit('https://github.com/octocat/hello-world')

    await screen.findByText(/Neglect and dependency rot/)
    expect(autopsyMock.mock.calls[0][3]).toEqual({ status: 'unavailable' })
    expect(screen.queryByRole('region', { name: /readme text/i })).toBeNull()
    expect(screen.queryByRole('link', { name: /original readme/i })).toBeNull()
  })

  it('ERROR_AI: no README panel text is shown', async () => {
    fetchMock.mockResolvedValue(vitals)
    readmeMock.mockResolvedValue('# Widget\n\nA tiny library.')
    autopsyMock.mockRejectedValue(new AutopsyAiError('AI request failed: offline'))
    render(<App />)
    submit('https://github.com/octocat/hello-world')

    await screen.findByRole('alert')
    expect(readmeMock).toHaveBeenCalledTimes(1)
    expect(screen.queryByText(/A tiny library/)).toBeNull()
    expect(screen.queryByRole('link', { name: /original readme/i })).toBeNull()
  })

  it('a 7000 character README is shown cut to 6000 with the note and sent cut to 6000', async () => {
    fetchMock.mockResolvedValue(vitals)
    readmeMock.mockResolvedValue('a'.repeat(7000))
    autopsyMock.mockResolvedValue(report)
    render(<App />)
    submit('https://github.com/octocat/hello-world')

    await screen.findByText(/Neglect and dependency rot/)
    const pane = await screen.findByRole('region', { name: /readme text/i })
    expect(pane.textContent).toHaveLength(6000)
    expect(screen.getByText(/cut at 6000 characters/)).not.toBeNull()
    const payload = autopsyMock.mock.calls[0][3]
    expect(payload).toMatchObject({ status: 'available', truncated: true })
    expect(payload && 'text' in payload ? payload.text : '').toHaveLength(6000)
  })

  it('analysing the same repo again with different letter case reuses the README cache', async () => {
    fetchMock.mockResolvedValue(vitals)
    readmeMock.mockResolvedValue('# Widget\n\nA tiny library.')
    autopsyMock.mockResolvedValue(report)
    render(<App />)
    submit('https://github.com/octocat/hello-world')

    await screen.findByText(/Neglect and dependency rot/)
    fireEvent.click(screen.getByRole('button', { name: /analyse another/i }))
    submit('https://github.com/Octocat/Hello-World')

    expect(await screen.findByText(/A tiny library\./)).not.toBeNull()
    expect(autopsyMock).toHaveBeenCalledTimes(2)
    expect(readmeMock).toHaveBeenCalledTimes(1)
  })
})

describe('App daily quota fallback', () => {
  const RESTING = 'the spirits are resting for today; instrument readings only.'
  const MARKER = 'the spirits are silent \u2014 showing instrument readings only.'

  const quotaError = () =>
    Object.assign(new AutopsyAiError('AI daily quota exhausted: PerDay', 429), { quotaExhausted: true })

  it('quota error: FALLBACK with the marker line, the resting line, vitals, and no Retry button', async () => {
    fetchMock.mockResolvedValue(vitals)
    autopsyMock.mockRejectedValue(quotaError())
    render(<App />)
    submit('https://github.com/octocat/hello-world')

    expect(await screen.findByText(RESTING)).not.toBeNull()
    expect(screen.getByText(new RegExp(MARKER.replace('.', '\\.')))).not.toBeNull()
    expect(screen.getByText(/No commits in 50 months/)).not.toBeNull() // deterministic report
    expect(screen.getByText('831')).not.toBeNull() // vitals stay
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull() // not the ERROR_AI banner
    expect(autopsyMock).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: /analyse another/i })).not.toBeNull()
  })

  it('a plain AI transport error still shows the error banner with Retry and no resting line', async () => {
    fetchMock.mockResolvedValue(vitals)
    autopsyMock.mockRejectedValue(new AutopsyAiError('AI request failed: offline'))
    render(<App />)
    submit('https://github.com/octocat/hello-world')

    expect((await screen.findByRole('alert')).textContent).toContain('AI request failed: offline')
    expect(screen.getByRole('button', { name: /retry/i })).not.toBeNull()
    expect(screen.queryByText(RESTING)).toBeNull()
  })

  it('a schema error shows the marker line but not the resting line', async () => {
    fetchMock.mockResolvedValue(vitals)
    autopsyMock.mockRejectedValue(new AutopsySchemaError({ bad: true }))
    render(<App />)
    submit('https://github.com/octocat/hello-world')

    expect(await screen.findByText(new RegExp(MARKER.replace('.', '\\.')))).not.toBeNull()
    expect(screen.queryByText(RESTING)).toBeNull()
  })

  it('the resting line disappears after Analyse another', async () => {
    fetchMock.mockResolvedValue(vitals)
    autopsyMock.mockRejectedValue(quotaError())
    render(<App />)
    submit('https://github.com/octocat/hello-world')
    await screen.findByText(RESTING)

    fireEvent.click(screen.getByRole('button', { name: /analyse another/i }))

    expect(screen.queryByText(RESTING)).toBeNull()
    expect(screen.getByLabelText(/repository url/i)).not.toBeNull()
  })

  it('the resting line does not carry over to the next analysis when it succeeds', async () => {
    fetchMock.mockResolvedValue(vitals)
    autopsyMock.mockRejectedValueOnce(quotaError()).mockResolvedValueOnce(report)
    render(<App />)
    submit('https://github.com/octocat/hello-world')
    await screen.findByText(RESTING)

    fireEvent.click(screen.getByRole('button', { name: /analyse another/i }))
    submit('https://github.com/octocat/hello-world')

    expect(await screen.findByText(/Neglect and dependency rot/)).not.toBeNull()
    expect(screen.queryByText(RESTING)).toBeNull()
  })
})

describe('App report headings by status', () => {
  async function reportText(): Promise<string> {
    const region = await screen.findByRole('region', { name: /^autopsy report/i })
    return region.textContent ?? ''
  }

  it('DEAD repo: CAUSE OF DEATH and RESURRECTION PLAN', async () => {
    fetchMock.mockResolvedValue(vitals)
    autopsyMock.mockResolvedValue(report)
    render(<App />)
    submit('https://github.com/octocat/hello-world')

    const text = await reportText()
    expect(text).toContain('CAUSE OF DEATH')
    expect(text).toContain('RESURRECTION PLAN')
    expect(text).not.toContain('WHAT TO WATCH')
  })

  it('DYING repo keeps the autopsy headings', async () => {
    fetchMock.mockResolvedValue({ ...vitals, monthsSinceLastPush: 14 })
    autopsyMock.mockResolvedValue(report)
    render(<App />)
    submit('https://github.com/octocat/hello-world')

    const text = await reportText()
    expect(text).toContain('CAUSE OF DEATH')
    expect(text).toContain('RESURRECTION PLAN')
  })

  it('ALIVE repo at 1 month: WHAT TO WATCH and CARE PLAN', async () => {
    fetchMock.mockResolvedValue({ ...vitals, monthsSinceLastPush: 1 })
    autopsyMock.mockResolvedValue({ ...report, severity: 'stable' })
    render(<App />)
    submit('https://github.com/octocat/hello-world')

    const text = await reportText()
    expect(text).toContain('WHAT TO WATCH')
    expect(text).toContain('CARE PLAN')
    expect(text).not.toContain('CAUSE OF DEATH')
    expect(text).not.toContain('RESURRECTION PLAN')
  })

  it('hibernating repo at 7 months: WHAT TO WATCH and WAKE-UP PLAN', async () => {
    fetchMock.mockResolvedValue({ ...vitals, monthsSinceLastPush: 7 })
    autopsyMock.mockResolvedValue({ ...report, severity: 'stable' })
    render(<App />)
    submit('https://github.com/octocat/hello-world')

    const text = await reportText()
    expect(text).toContain('WHAT TO WATCH')
    expect(text).toContain('WAKE-UP PLAN')
    expect(text).not.toContain('CARE PLAN')
    expect(text).not.toContain('CAUSE OF DEATH')
  })

  it('ALIVE fallback report uses the same headings and neutral wording', async () => {
    fetchMock.mockResolvedValue({ ...vitals, monthsSinceLastPush: 0 })
    autopsyMock.mockRejectedValue(new AutopsySchemaError({ bad: true }))
    render(<App />)
    submit('https://github.com/octocat/hello-world')

    const text = await reportText()
    expect(text).toContain('the spirits are silent')
    expect(text).toContain('WHAT TO WATCH')
    expect(text).toContain('CARE PLAN')
    expect(text).toContain('pushed this month')
    expect(text).not.toMatch(/dead|death|abandon|\b0 months?\b/i)
  })

  it('hibernating fallback report uses WAKE-UP PLAN', async () => {
    fetchMock.mockResolvedValue({ ...vitals, monthsSinceLastPush: 7 })
    autopsyMock.mockRejectedValue(new AutopsySchemaError({ bad: true }))
    render(<App />)
    submit('https://github.com/octocat/hello-world')

    const text = await reportText()
    expect(text).toContain('WHAT TO WATCH')
    expect(text).toContain('WAKE-UP PLAN')
    expect(text).not.toMatch(/dead|death|abandon/i)
  })
})