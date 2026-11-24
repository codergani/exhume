import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AutopsyAiError, AutopsySchemaError } from '../src/errors'
import type { RepoVitals } from '../src/github/client'
import type { DepRotReport } from '../src/github/deps'

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

const { runAutopsy, INFERENCE_MODE, MODEL_NAME } = await import('../src/ai/provider')

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

  it('MODEL_NAME is gemini-2.0-flash', () => {
    expect(MODEL_NAME).toBe('gemini-2.0-flash')
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
    expect(Object.keys(sent).sort()).toEqual(['deps', 'vitals'])
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
