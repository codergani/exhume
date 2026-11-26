import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import './ui/theme.css'
import type { AppState } from './appState'
import { parseRepoUrl } from './lib/parseRepoUrl'
import { classifyStatus } from './lib/classifyStatus'
import { fetchRepoVitals } from './github/client'
import type { RepoVitals } from './github/client'
import type { DepRotReport } from './github/deps'
import { fetchForks } from './github/forks'
import { buildForkSummary, monthsSince, selectLivingForks } from './lib/forks'
import type { ForkResult } from './lib/forks'
import { fetchReadme } from './github/readme'
import { buildReadmeExcerpt, buildReadmePayload, buildReadmeUrl } from './lib/readme'
import type { ReadmeResult } from './lib/readme'
import { runAutopsy } from './ai/provider'
import { buildFallbackReport } from './ai/fallback'
import { AutopsyAiError, AutopsySchemaError, GitHubRateLimitError } from './errors'
import { TerminalOutput } from './ui/TerminalOutput'
import { VitalsPanel } from './ui/VitalsPanel'
import { ForksPanel } from './ui/ForksPanel'
import { ReadmePanel } from './ui/ReadmePanel'
import { ErrorBanner } from './ui/ErrorBanner'
import { progressLines, reportHeadings, reportLines } from './ui/lines'
import { prefersReducedMotion } from './ui/motion'

const INVALID_URL_MESSAGE =
  'That is not a grave I recognise. Enter a GitHub repository URL, e.g. https://github.com/owner/repo'

const STAGE_PAUSE_MS = 400

/** Dependency rot is optional (task 16). Until it exists, report it as skipped. */
const SKIPPED_DEP_ROT: DepRotReport = {
  packageName: '',
  dependenciesChecked: 0,
  outdatedDeps: [],
  skipped: true,
  skipReason: 'Dependency analysis is not available in this build',
}

const RESTING_LINE = 'the spirits are resting for today; instrument readings only.'

/**
 * True for an AutopsyAiError flagged quotaExhausted (HTTP 429, per-day quota). Checked by
 * the flag, not by importing the provider's class, so it also works when the provider is mocked.
 */
function isQuotaExhausted(err: unknown): boolean {
  return (
    err instanceof AutopsyAiError &&
    (err as AutopsyAiError & { quotaExhausted?: boolean }).quotaExhausted === true
  )
}

function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err))
}

/** Looks up living forks of a DEAD or DYING repo. Never throws: failures become 'unavailable'. */
async function findForks(owner: string, repo: string, vitals: RepoVitals): Promise<ForkResult> {
  try {
    const forks = await fetchForks(owner, repo)
    const now = new Date()
    const original = Date.parse(vitals.lastPushDate)
    const livingTotal = forks.filter(
      (f) =>
        !f.archived && monthsSince(f.lastPushDate, now) < 12 && Date.parse(f.lastPushDate) > original,
    ).length
    const living = selectLivingForks(forks, vitals.lastPushDate, now)
    return { status: 'available', living, inspected: forks.length, livingTotal }
  } catch (err) {
    if (err instanceof GitHubRateLimitError) {
      const time = err.resetAt.toLocaleTimeString()
      return {
        status: 'unavailable',
        message: `the fork registry is sealed until ${time}. the plan below does not depend on it; try again after then.`,
      }
    }
    return {
      status: 'unavailable',
      message: 'could not reach the fork registry. the plan below does not depend on it.',
    }
  }
}

const README_MISSING_MESSAGE = 'no readme was left with these remains.'

/** Reads the README. Never throws: failures and missing files become 'unavailable'. */
async function findReadme(owner: string, repo: string): Promise<ReadmeResult> {
  try {
    const text = await fetchReadme(owner, repo)
    if (text === null) return { status: 'unavailable', message: README_MISSING_MESSAGE }
    const ex = buildReadmeExcerpt(text)
    if (ex.empty) return { status: 'unavailable', message: README_MISSING_MESSAGE }
    return { status: 'available', text: ex.text, truncated: ex.truncated, url: buildReadmeUrl(owner, repo) }
  } catch (err) {
    if (err instanceof GitHubRateLimitError) {
      if (Number.isNaN(err.resetAt.getTime())) {
        return {
          status: 'unavailable',
          message: 'the readme vault is sealed. the report does not depend on it; try again later.',
        }
      }
      return {
        status: 'unavailable',
        message: `the readme vault is sealed until ${err.resetAt.toLocaleTimeString()}. the report does not depend on it; try again after then.`,
      }
    }
    return {
      status: 'unavailable',
      message: 'could not read the readme. the report does not depend on it.',
    }
  }
}

function App() {
  const [state, setState] = useState<AppState>({ stage: 'IDLE' })
  const [url, setUrl] = useState('')
  const [inputError, setInputError] = useState<string | null>(null)
  // Increments on every run and on reset, so results from an abandoned run are ignored.
  const runRef = useRef(0)
  // In-memory cache of GitHub vitals (unauthenticated API allows 60 requests/hour).
  const vitalsCache = useRef(new Map<string, RepoVitals>())
  // The forks step outcome lives outside AppState. Only successful lookups are cached.
  const [forkResult, setForkResult] = useState<ForkResult | null>(null)
  const forksCache = useRef(new Map<string, ForkResult>())
  // The README step outcome also lives outside AppState. Only available results are cached.
  const [readmeResult, setReadmeResult] = useState<ReadmeResult | null>(null)
  // True when the FALLBACK report is shown because the AI's daily quota is used up.
  const [restingToday, setRestingToday] = useState(false)
  const readmeCache = useRef(new Map<string, ReadmeResult>())

  async function consult(
    vitals: RepoVitals,
    depRot: DepRotReport,
    forks: ForkResult,
    readme: ReadmeResult,
    isCurrent: () => boolean,
  ) {
    setRestingToday(false)
    setState({ stage: 'CONSULTING', vitals, depRot })
    const summary = buildForkSummary(forks, new Date())
    try {
      const report = await runAutopsy(vitals, depRot, summary, buildReadmePayload(readme))
      if (isCurrent()) setState({ stage: 'RESULTS', vitals, depRot, report })
    } catch (err) {
      if (!isCurrent()) return
      if (err instanceof AutopsySchemaError || isQuotaExhausted(err)) {
        // Schema failure and an exhausted daily quota both end in the deterministic report.
        // A quota failure is not retryable, so there is no Retry button for it.
        setRestingToday(isQuotaExhausted(err))
        const report = buildFallbackReport(vitals, depRot, summary)
        setState({ stage: 'FALLBACK', vitals, depRot, report })
      } else {
        const error = err instanceof AutopsyAiError ? err : new AutopsyAiError(toError(err).message)
        setState({ stage: 'ERROR_AI', vitals, depRot, error })
      }
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (state.stage !== 'IDLE') return

    const parsed = parseRepoUrl(url)
    if (!parsed) {
      setInputError(INVALID_URL_MESSAGE) // no API call is made
      return
    }
    setInputError(null)

    const runId = ++runRef.current
    const isCurrent = () => runRef.current === runId

    setState({ stage: 'FETCHING' })
    const key = `${parsed.owner}/${parsed.repo}`.toLowerCase()
    let vitals: RepoVitals
    try {
      vitals = vitalsCache.current.get(key) ?? (await fetchRepoVitals(parsed.owner, parsed.repo))
      vitalsCache.current.set(key, vitals)
    } catch (err) {
      if (isCurrent()) setState({ stage: 'ERROR_GITHUB', error: toError(err) })
      return
    }
    if (!isCurrent()) return

    setState({ stage: 'EXAMINING', vitals })

    const loadForks = async (): Promise<ForkResult> => {
      if (classifyStatus(vitals) === 'ALIVE') return { status: 'skipped' }
      return forksCache.current.get(key) ?? (await findForks(parsed.owner, parsed.repo, vitals))
    }
    const loadReadme = async (): Promise<ReadmeResult> =>
      readmeCache.current.get(key) ?? (await findReadme(parsed.owner, parsed.repo))
    const [forks, readme] = await Promise.all([loadForks(), loadReadme()])
    if (!isCurrent()) return
    if (forks.status === 'available') forksCache.current.set(key, forks)
    if (readme.status === 'available') readmeCache.current.set(key, readme)
    setForkResult(forks)
    setReadmeResult(readme)

    if (!prefersReducedMotion()) {
      await new Promise((resolve) => setTimeout(resolve, STAGE_PAUSE_MS))
      if (!isCurrent()) return
    }

    await consult(vitals, SKIPPED_DEP_ROT, forks, readme, isCurrent)
  }

  /** ERROR_AI -> CONSULTING with the vitals already held; GitHub is not called again. */
  function handleRetry() {
    if (state.stage !== 'ERROR_AI') return
    if (!forkResult || !readmeResult) return
    const { vitals, depRot } = state
    const runId = ++runRef.current
    void consult(vitals, depRot, forkResult, readmeResult, () => runRef.current === runId)
  }

  function handleReset() {
    runRef.current++
    setInputError(null)
    setForkResult(null)
    setReadmeResult(null)
    setRestingToday(false)
    setState({ stage: 'IDLE' })
  }

  const vitals = 'vitals' in state ? state.vitals : null
  const lines = progressLines(state.stage)
  const finished = state.stage === 'RESULTS' || state.stage === 'FALLBACK'

  return (
    <main className="exhume">
      <h1>EXHUME</h1>
      <p className="tagline">autopsy and resurrection plan for abandoned repositories</p>

      {state.stage === 'IDLE' && (
        <form onSubmit={handleSubmit} noValidate>
          <label htmlFor="repo-url">Repository URL</label>
          <input
            id="repo-url"
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://github.com/owner/repo"
            autoComplete="off"
            spellCheck={false}
            aria-describedby={inputError ? 'repo-url-error' : undefined}
          />
          <button type="submit">Exhume</button>
        </form>
      )}
      {inputError && (
        <p id="repo-url-error" className="input-error" role="alert">
          {inputError}
        </p>
      )}

      {lines.length > 0 && (
        <TerminalOutput lines={lines} typewriterActive={false} label="Progress" />
      )}

      {vitals && <VitalsPanel vitals={vitals} status={classifyStatus(vitals)} />}

      {forkResult && <ForksPanel result={forkResult} />}

      {state.stage === 'ERROR_GITHUB' && (
        <>
          <ErrorBanner error={state.error} />
          <div className="actions">
            <button type="button" onClick={handleReset}>
              Start over
            </button>
          </div>
        </>
      )}

      {state.stage === 'ERROR_AI' && (
        <>
          <ErrorBanner error={state.error} onRetry={handleRetry} />
          <div className="actions">
            <button type="button" className="secondary" onClick={handleReset}>
              Start over
            </button>
          </div>
        </>
      )}

      {(state.stage === 'RESULTS' || state.stage === 'FALLBACK') && (
        <TerminalOutput
          key={state.report.generatedAt}
          lines={reportLines(
            state.report,
            state.stage === 'FALLBACK',
            reportHeadings(classifyStatus(state.vitals), state.vitals.monthsSinceLastPush),
          )}
          typewriterActive
          label={state.stage === 'FALLBACK' ? 'Autopsy report (instrument readings only)' : 'Autopsy report'}
        />
      )}

      {state.stage === 'FALLBACK' && restingToday && (
        <p className="forks-note" role="status">
          {RESTING_LINE}
        </p>
      )}

      {readmeResult && finished && <ReadmePanel result={readmeResult} />}

      {finished && (
        <div className="actions">
          <button type="button" onClick={handleReset}>
            Analyse another
          </button>
        </div>
      )}
    </main>
  )
}

export default App