import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AutopsyAiError, AutopsySchemaError } from '../src/errors'
import type { RepoVitals } from '../src/github/client'
import type { DepRotReport } from '../src/github/deps'
import type { ForkSummary } from '../src/lib/forks'

// Mock firebase/app and firebase/ai before importing provider
const mockInitializeApp = vi.fn(() => ({ name: 'exhume-ai' }))
const mockGetApps = vi.fn((): { name: string }[] => [])

vi.mock('firebase/app', () => ({
  initializeApp: mockInitializeApp,
  getApps: mockGetApps,
}))

const mockGenerateContent = vi.fn()
const mockGetGenerativeModel = vi.fn(() => ({ generateContent: mockGenerateContent }))
const mockGetAI = vi.fn(() => ({}))

vi.mock('firebase/ai', () => ({
  getAI: mockGetAI,
  getGenerativeModel: mockGetGenerativeModel,
  GoogleAIBackend: class {},
}))

const { runAutopsy, INFERENCE_MODE, MODEL_NAME, MAX_ATTEMPTS, backoffDelayMs } =
  await import('../src/ai/provider')

const SECRET = 'AIzaSy-test-secret-key-value'

function stubFullEnv() {
  vi.stubEnv('VITE_FIREBASE_API_KEY', SECRET)
  vi.stubEnv('VITE_FIREBASE_AUTH_DOMAIN', 'exhume-test.firebaseapp.com')
  vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'exhume-test')
  vi.stubEnv('VITE_FIREBASE_APP_ID', '1:123:web:abc')
}

const vitals: RepoVitals = {
  lastPushDate: '2021-01-01T00:00:00Z',
  archived: false,
  openIssueCount: 10,
  starCount: 200,
  monthsSinceLastPush: 48,
}

const depRot: DepRotReport = {
  packageName: 'my-pkg',
  dependenciesChecked: 0,
  outdatedDeps: [],
  skipped: true,
  skipReason: undefined,
}

const validPayload = {
  causeOfDeath: 'Neglect and dependency rot.',
  severity: 'critical',
  steps: [
    { order: 1, action: 'Assess community interest', rationale: 'Stars indicate demand.' },
    { order: 2, action: 'Upgrade deps', rationale: 'Old deps block modern tooling.' },
    { order: 3, action: 'Fork or archive', rationale: 'No maintainer response expected.' },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetApps.mockReturnValue([])
  stubFullEnv()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('provider constants', () => {
  it('INFERENCE_MODE is "cloud"', () => {
    expect(INFERENCE_MODE).toBe('cloud')
  })

  it('MODEL_NAME is gemini-3.8-flash', () => {
    expect(MODEL_NAME).toBe('gemini-3.8-flash')
  })
})

describe('runAutopsy: configuration', () => {
  it('initialises Firebase from the four VITE_FIREBASE_* variables', async () => {
    mockGenerateContent.mockResolvedValue({ response: { text: () => JSON.stringify(validPayload) } })
    await runAutopsy(vitals, depRot)

    expect(mockInitializeApp).toHaveBeenCalledWith(
      {
        apiKey: SECRET,
        authDomain: 'exhume-test.firebaseapp.com',
        projectId: 'exhume-test',
        appId: '1:123:web:abc',
      },
      'exhume-ai',
    )
    expect(mockGetAI).toHaveBeenCalledTimes(1)
    expect(mockGetGenerativeModel).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ model: MODEL_NAME }),
    )
  })

  it('reuses an existing Firebase app instead of initialising again', async () => {
    mockGetApps.mockReturnValue([{ name: 'exhume-ai' }])
    mockGenerateContent.mockResolvedValue({ response: { text: () => JSON.stringify(validPayload) } })
    await runAutopsy(vitals, depRot)
    expect(mockInitializeApp).not.toHaveBeenCalled()
  })

  it('throws AutopsyAiError naming every missing variable, without calling the AI', async () => {
    vi.stubEnv('VITE_FIREBASE_API_KEY', '')
    vi.stubEnv('VITE_FIREBASE_PROJECT_ID', '')

    const err = await runAutopsy(vitals, depRot).catch((e) => e)

    expect(err).toBeInstanceOf(AutopsyAiError)
    expect(err.message).toContain('VITE_FIREBASE_API_KEY')
    expect(err.message).toContain('VITE_FIREBASE_PROJECT_ID')
    expect(err.message).not.toContain('VITE_FIREBASE_APP_ID')
    expect(mockInitializeApp).not.toHaveBeenCalled()
    expect(mockGenerateContent).not.toHaveBeenCalled()
  })

  it('never includes the key value in a thrown error message', async () => {
    mockGenerateContent.mockRejectedValue(new Error('network down'))
    const err = await runAutopsy(vitals, depRot).catch((e) => e)
    expect(err).toBeInstanceOf(AutopsyAiError)
    expect(err.message).not.toContain(SECRET)
  })

  it('does not write the key to console or localStorage-like storage', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => {}),
    )
    mockGenerateContent.mockResolvedValue({ response: { text: () => JSON.stringify(validPayload) } })
    await runAutopsy(vitals, depRot)
    for (const spy of spies) {
      expect(spy).not.toHaveBeenCalled()
      spy.mockRestore()
    }
  })
})

describe('runAutopsy: behaviour', () => {
  it('returns a report with generatedAt when AI returns valid JSON first time', async () => {
    mockGenerateContent.mockResolvedValue({ response: { text: () => JSON.stringify(validPayload) } })
    const report = await runAutopsy(vitals, depRot)

    expect(report.causeOfDeath).toBe(validPayload.causeOfDeath)
    expect(report.severity).toBe('critical')
    expect(report.steps).toHaveLength(3)
    expect(report.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(mockGenerateContent).toHaveBeenCalledTimes(1)
  })

  it('sends only vitals and deps in the prompt', async () => {
    mockGenerateContent.mockResolvedValue({ response: { text: () => JSON.stringify(validPayload) } })
    await runAutopsy(vitals, depRot)
    const sent = JSON.parse(mockGenerateContent.mock.calls[0][0])
    expect(Object.keys(sent).sort()).toEqual(['deps', 'forks', 'vitals'])
  })

  it('retries once on schema failure and succeeds on the second call', async () => {
    mockGenerateContent
      .mockResolvedValueOnce({ response: { text: () => JSON.stringify({ wrong: true }) } })
      .mockResolvedValueOnce({ response: { text: () => JSON.stringify(validPayload) } })

    const report = await runAutopsy(vitals, depRot)
    expect(report.causeOfDeath).toBe(validPayload.causeOfDeath)
    expect(mockGenerateContent).toHaveBeenCalledTimes(2)
  })

  it('throws AutopsySchemaError when schema fails on both attempts', async () => {
    mockGenerateContent.mockResolvedValue({ response: { text: () => JSON.stringify({ not: 'valid' }) } })

    await expect(runAutopsy(vitals, depRot)).rejects.toBeInstanceOf(AutopsySchemaError)
    expect(mockGenerateContent).toHaveBeenCalledTimes(2)
  })

  it('throws AutopsyAiError on transport failure', async () => {
    mockGenerateContent.mockRejectedValue(new Error('fetch failed'))
    await expect(runAutopsy(vitals, depRot)).rejects.toBeInstanceOf(AutopsyAiError)
  })

  it('throws AutopsyAiError when AI returns non-JSON text', async () => {
    mockGenerateContent.mockResolvedValue({ response: { text: () => 'sorry, I cannot help' } })
    await expect(runAutopsy(vitals, depRot)).rejects.toBeInstanceOf(AutopsyAiError)
  })

  it('strips markdown code fences before parsing', async () => {
    mockGenerateContent.mockResolvedValue({
      response: { text: () => `\`\`\`json\n${JSON.stringify(validPayload)}\n\`\`\`` },
    })
    const report = await runAutopsy(vitals, depRot)
    expect(report.causeOfDeath).toBe(validPayload.causeOfDeath)
  })
})

/** Mimics a Firebase AIError carrying an HTTP status in customErrorData. */
function httpError(status: number) {
  return Object.assign(new Error(`Error fetching: [${status}] upstream`), {
    customErrorData: { status },
  })
}

const okResponse = () => ({ response: { text: () => JSON.stringify(validPayload) } })

describe('runAutopsy: transient failure backoff', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('uses 4 attempts with 1s, 2s, 4s exponential delays', () => {
    expect(MAX_ATTEMPTS).toBe(4)
    expect([1, 2, 3].map(backoffDelayMs)).toEqual([1000, 2000, 4000])
  })

  it('500 then success: succeeds after waiting 1s', async () => {
    mockGenerateContent.mockRejectedValueOnce(httpError(500)).mockResolvedValueOnce(okResponse())

    const pending = runAutopsy(vitals, depRot)
    await vi.advanceTimersByTimeAsync(999)
    expect(mockGenerateContent).toHaveBeenCalledTimes(1) // still waiting
    await vi.advanceTimersByTimeAsync(1)

    const report = await pending
    expect(report.causeOfDeath).toBe(validPayload.causeOfDeath)
    expect(mockGenerateContent).toHaveBeenCalledTimes(2)
  })

  it('three 500s then success: succeeds on the fourth call after 1s, 2s, 4s', async () => {
    mockGenerateContent
      .mockRejectedValueOnce(httpError(500))
      .mockRejectedValueOnce(httpError(500))
      .mockRejectedValueOnce(httpError(500))
      .mockResolvedValueOnce(okResponse())

    const pending = runAutopsy(vitals, depRot)
    expect(mockGenerateContent).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1000)
    expect(mockGenerateContent).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(1999)
    expect(mockGenerateContent).toHaveBeenCalledTimes(2) // 2s wait not finished
    await vi.advanceTimersByTimeAsync(1)
    expect(mockGenerateContent).toHaveBeenCalledTimes(3)

    await vi.advanceTimersByTimeAsync(3999)
    expect(mockGenerateContent).toHaveBeenCalledTimes(3) // 4s wait not finished
    await vi.advanceTimersByTimeAsync(1)

    const report = await pending
    expect(report.causeOfDeath).toBe(validPayload.causeOfDeath)
    expect(mockGenerateContent).toHaveBeenCalledTimes(4)
  })

  it('four 500s: throws AutopsyAiError after waits of 1s, 2s, 4s, no 5th call', async () => {
    mockGenerateContent.mockRejectedValue(httpError(500))

    const pending = runAutopsy(vitals, depRot).catch((e) => e)
    expect(mockGenerateContent).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1000)
    expect(mockGenerateContent).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(2000)
    expect(mockGenerateContent).toHaveBeenCalledTimes(3)
    await vi.advanceTimersByTimeAsync(4000)

    const err = await pending
    expect(err).toBeInstanceOf(AutopsyAiError)
    expect(err.statusCode).toBe(500)
    expect(err.message).toContain('after 4 attempts')
    expect(mockGenerateContent).toHaveBeenCalledTimes(4)

    await vi.advanceTimersByTimeAsync(20_000)
    expect(mockGenerateContent).toHaveBeenCalledTimes(4)
  })
  it.each([503, 429])('retries HTTP %i and succeeds', async (status) => {
    mockGenerateContent.mockRejectedValueOnce(httpError(status)).mockResolvedValueOnce(okResponse())

    const pending = runAutopsy(vitals, depRot)
    await vi.advanceTimersByTimeAsync(1000)

    await expect(pending).resolves.toMatchObject({ severity: 'critical' })
    expect(mockGenerateContent).toHaveBeenCalledTimes(2)
  })

  it('404: no retry, throws immediately', async () => {
    mockGenerateContent.mockRejectedValue(httpError(404))

    const err = await runAutopsy(vitals, depRot).catch((e) => e)

    expect(err).toBeInstanceOf(AutopsyAiError)
    expect(err.statusCode).toBe(404)
    expect(mockGenerateContent).toHaveBeenCalledTimes(1)
  })

  it.each([400, 401, 403])('HTTP %i: no retry, throws immediately', async (status) => {
    mockGenerateContent.mockRejectedValue(httpError(status))

    const err = await runAutopsy(vitals, depRot).catch((e) => e)

    expect(err).toBeInstanceOf(AutopsyAiError)
    expect(err.statusCode).toBe(status)
    expect(mockGenerateContent).toHaveBeenCalledTimes(1)
  })

  it('an error with no HTTP status is not retried', async () => {
    mockGenerateContent.mockRejectedValue(new Error('something odd'))

    await expect(runAutopsy(vitals, depRot)).rejects.toBeInstanceOf(AutopsyAiError)
    expect(mockGenerateContent).toHaveBeenCalledTimes(1)
  })

  it('schema retry still works after a transient failure', async () => {
    mockGenerateContent
      .mockRejectedValueOnce(httpError(503))
      .mockResolvedValueOnce({ response: { text: () => JSON.stringify({ wrong: true }) } })
      .mockResolvedValueOnce(okResponse())

    const pending = runAutopsy(vitals, depRot)
    await vi.advanceTimersByTimeAsync(1000)

    await expect(pending).resolves.toMatchObject({ causeOfDeath: validPayload.causeOfDeath })
    expect(mockGenerateContent).toHaveBeenCalledTimes(3)
  })

  it('never logs or leaks the key while retrying', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => {}),
    )
    mockGenerateContent.mockRejectedValue(httpError(500))

    const pending = runAutopsy(vitals, depRot).catch((e) => e)
    await vi.advanceTimersByTimeAsync(7000)
    const err = await pending

    expect(err.message).not.toContain(SECRET)
    for (const spy of spies) {
      expect(spy).not.toHaveBeenCalled()
      spy.mockRestore()
    }
  })
})

const forkSummary: ForkSummary = {
  status: 'available',
  livingCount: 2,
  top: [
    { owner: 'Alice', name: 'my-pkg', stars: 40, monthsSincePush: 2 },
    { owner: 'bob', name: 'my-pkg-next', stars: 10, monthsSincePush: 5 },
  ],
}

const replyWith = (recommendation?: unknown) => ({
  response: {
    text: () =>
      JSON.stringify(recommendation === undefined ? validPayload : { ...validPayload, recommendation }),
  },
})

describe('runAutopsy: fork summary and recommendation', () => {
  it('sends the fork summary as given', async () => {
    mockGenerateContent.mockResolvedValue(replyWith())
    await runAutopsy(vitals, depRot, forkSummary)
    const sent = JSON.parse(mockGenerateContent.mock.calls[0][0])
    expect(sent.forks).toEqual(forkSummary)
  })

  it('defaults forks to unavailable when omitted', async () => {
    mockGenerateContent.mockResolvedValue(replyWith())
    await runAutopsy(vitals, depRot)
    const sent = JSON.parse(mockGenerateContent.mock.calls[0][0])
    expect(sent.forks).toEqual({ status: 'unavailable' })
  })

  it('sends only vitals, deps and forks, with no source-code-like fields', async () => {
    mockGenerateContent.mockResolvedValue(replyWith())
    await runAutopsy(vitals, depRot, forkSummary)
    const raw = mockGenerateContent.mock.calls[0][0] as string
    const sent = JSON.parse(raw)
    expect(Object.keys(sent).sort()).toEqual(['deps', 'forks', 'vitals'])
    for (const key of ['source', 'code', 'content', 'files', 'commits', 'message', 'readme']) {
      expect(raw.toLowerCase()).not.toContain(`"${key}"`)
    }
  })

  it('accepts a reply without recommendation and returns no recommendation key', async () => {
    mockGenerateContent.mockResolvedValue(replyWith())
    const report = await runAutopsy(vitals, depRot, forkSummary)
    expect('recommendation' in report).toBe(false)
  })

  it('drops an adopt-fork recommendation naming a fork not in forks.top', async () => {
    mockGenerateContent.mockResolvedValue(
      replyWith({ kind: 'adopt-fork', fork: 'mallory/invented', reason: 'Looks active.' }),
    )
    const report = await runAutopsy(vitals, depRot, forkSummary)
    expect('recommendation' in report).toBe(false)
  })

  it('drops an adopt-fork recommendation with no fork field', async () => {
    mockGenerateContent.mockResolvedValue(replyWith({ kind: 'adopt-fork', reason: 'Looks active.' }))
    const report = await runAutopsy(vitals, depRot, forkSummary)
    expect('recommendation' in report).toBe(false)
  })

  it.each(['alice/my-pkg', 'ALICE/MY-PKG', 'Alice/My-Pkg', 'BOB/my-pkg-next'])(
    'keeps an adopt-fork recommendation naming a listed fork (%s)',
    async (fork) => {
      const recommendation = { kind: 'adopt-fork', fork, reason: 'Most active.' }
      mockGenerateContent.mockResolvedValue(replyWith(recommendation))
      const report = await runAutopsy(vitals, depRot, forkSummary)
      expect(report.recommendation).toEqual(recommendation)
    },
  )

  it('keeps a revive-original recommendation', async () => {
    const recommendation = { kind: 'revive-original', reason: 'Forks are thin.' }
    mockGenerateContent.mockResolvedValue(replyWith(recommendation))
    const report = await runAutopsy(vitals, depRot, forkSummary)
    expect(report.recommendation).toEqual(recommendation)
  })

  it.each([
    ['omitted', undefined],
    ['unavailable', { status: 'unavailable' } as ForkSummary],
  ])('drops an adopt-fork recommendation when forks are %s', async (_label, forks) => {
    mockGenerateContent.mockResolvedValue(
      replyWith({ kind: 'adopt-fork', fork: 'alice/my-pkg', reason: 'Most active.' }),
    )
    const report = await runAutopsy(vitals, depRot, forks)
    expect('recommendation' in report).toBe(false)
  })
})
