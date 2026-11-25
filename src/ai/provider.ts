/**
 * Firebase AI Logic wrapper: the only place in the codebase that calls the AI.
 * Cloud inference only. Firebase config comes from VITE_FIREBASE_* variables.
 * No key is logged, persisted, or included in error messages.
 */
import { initializeApp, getApps } from 'firebase/app'
import { getAI, getGenerativeModel, GoogleAIBackend } from 'firebase/ai'
import type { RepoVitals } from '../github/client'
import type { DepRotReport } from '../github/deps'
import type { ForkSummary } from '../lib/forks'
import { autopsyReportSchema } from './schema'
import type { AutopsyReport } from './fallback'
import { AutopsyAiError, AutopsySchemaError } from '../errors'

/** Inference mode: cloud only for now; hybrid reserved for a future task. */
export const INFERENCE_MODE = 'cloud' as const

export const MODEL_NAME = 'gemini-3.8-flash'

const APP_NAME = 'exhume-ai'

const SYSTEM_INSTRUCTION = `You are a software archaeologist. Given vital signs and dependency rot data for a GitHub repository, produce a clinical autopsy report as JSON. Do not include any commentary outside the JSON object. Respond only with valid JSON matching this schema exactly:
{ "causeOfDeath": string, "severity": "critical"|"serious"|"stable", "steps": [{ "order": number, "action": string, "rationale": string }] }
steps must contain 3 to 7 items numbered sequentially from 1. Be terse and clinical.
If the payload's forks has status "available" and lists at least one fork, you may add an optional "recommendation" object: { "kind": "adopt-fork" | "revive-original", "fork": "owner/name" (only for adopt-fork, and it must be one of the listed forks), "reason": string }. Omit recommendation entirely if unsure.`

const REQUIRED_ENV = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_APP_ID',
] as const

function buildPrompt(vitals: RepoVitals, depRot: DepRotReport, forks?: ForkSummary): string {
  return JSON.stringify({ vitals, deps: depRot, forks: forks ?? { status: 'unavailable' } })
}

/**
 * Reads Firebase config from import.meta.env at call time.
 * Throws AutopsyAiError naming the missing variables (never their values).
 */
function readFirebaseConfig() {
  const env = import.meta.env as Record<string, string | undefined>
  const missing = REQUIRED_ENV.filter((name) => !env[name])
  if (missing.length > 0) {
    throw new AutopsyAiError(
      `AI is not configured. Missing environment variable(s): ${missing.join(', ')}. ` +
        'Add them to .env.local (see .env.example) and restart the dev server.',
    )
  }
  return {
    apiKey: env.VITE_FIREBASE_API_KEY as string,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN as string,
    projectId: env.VITE_FIREBASE_PROJECT_ID as string,
    appId: env.VITE_FIREBASE_APP_ID as string,
  }
}

function getFirebaseApp() {
  const existing = getApps().find((a) => a.name === APP_NAME)
  if (existing) return existing
  return initializeApp(readFirebaseConfig(), APP_NAME)
}

/** HTTP statuses worth retrying. 400, 401, 403 and 404 are permanent and never retried. */
const TRANSIENT_STATUSES: ReadonlySet<number> = new Set([429, 500, 503])

/** Total attempts per AI call, including the first. */
export const MAX_ATTEMPTS = 4

/** Delay before retry n (1-based): 1s, 2s, 4s. */
export function backoffDelayMs(retryNumber: number): number {
  return 1000 * 2 ** (retryNumber - 1)
}

/** Reads the HTTP status from a Firebase AIError (customErrorData.status). */
function httpStatusOf(err: unknown): number | undefined {
  if (typeof err !== 'object' || err === null) return undefined
  const status = (err as { customErrorData?: { status?: unknown } }).customErrorData?.status
  return typeof status === 'number' ? status : undefined
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Calls generateContent, retrying only transient HTTP failures (429, 500, 503)
 * with exponential backoff. Anything else fails immediately. Error messages
 * carry the status and the SDK message only; no key or token is logged.
 */
async function generateWithBackoff(
  model: ReturnType<typeof getGenerativeModel>,
  prompt: string,
) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await model.generateContent(prompt)
    } catch (err) {
      const status = httpStatusOf(err)
      const msg = err instanceof Error ? err.message : String(err)
      const transient = status !== undefined && TRANSIENT_STATUSES.has(status)

      if (!transient) {
        throw new AutopsyAiError(`AI request failed: ${msg}`, status)
      }
      if (attempt >= MAX_ATTEMPTS) {
        throw new AutopsyAiError(
          `AI request failed after ${MAX_ATTEMPTS} attempts: ${msg}`,
          status,
        )
      }
      await sleep(backoffDelayMs(attempt))
    }
  }
}
async function callAI(
  vitals: RepoVitals,
  depRot: DepRotReport,
  forks?: ForkSummary,
): Promise<unknown> {
  // Config is validated here, before any network call.
  const app = getFirebaseApp()
  const ai = getAI(app, { backend: new GoogleAIBackend() })
  const model = getGenerativeModel(ai, {
    model: MODEL_NAME,
    systemInstruction: SYSTEM_INSTRUCTION,
  })

  const result = await generateWithBackoff(model, buildPrompt(vitals, depRot, forks))

  const text = result.response.text()
  // Strip markdown code fences if the model wraps the JSON in ```json ... ```
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()

  try {
    return JSON.parse(cleaned)
  } catch {
    throw new AutopsyAiError('AI response was not valid JSON')
  }
}

/**
 * Generates an autopsy report.
 * Retries schema validation once before throwing AutopsySchemaError.
 * Throws AutopsyAiError on missing config or transport/HTTP failure.
 */
export async function runAutopsy(
  vitals: RepoVitals,
  depRot: DepRotReport,
  forks?: ForkSummary,
): Promise<AutopsyReport> {
  let raw = await callAI(vitals, depRot, forks)
  let parsed = autopsyReportSchema.safeParse(raw)

  if (!parsed.success) {
    raw = await callAI(vitals, depRot, forks)
    parsed = autopsyReportSchema.safeParse(raw)
    if (!parsed.success) {
      throw new AutopsySchemaError(raw)
    }
  }

  const { recommendation, ...rest } = parsed.data
  const generatedAt = new Date().toISOString()
  if (recommendation === undefined) return { ...rest, generatedAt }

  if (recommendation.kind === 'adopt-fork') {
    const listed =
      forks?.status === 'available'
        ? forks.top.map((f) => `${f.owner}/${f.name}`.toLowerCase())
        : []
    if (!recommendation.fork || !listed.includes(recommendation.fork.toLowerCase())) {
      return { ...rest, generatedAt }
    }
  }
  return { ...rest, recommendation, generatedAt }
}
