import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import './ui/theme.css'
import type { AppState } from './appState'
import { parseRepoUrl } from './lib/parseRepoUrl'
import { classifyStatus } from './lib/classifyStatus'
import { fetchRepoVitals } from './github/client'
import type { RepoVitals } from './github/client'
import type { DepRotReport } from './github/deps'
import { runAutopsy } from './ai/provider'
import { buildFallbackReport } from './ai/fallback'
import { AutopsyAiError, AutopsySchemaError } from './errors'
import { TerminalOutput } from './ui/TerminalOutput'
import { VitalsPanel } from './ui/VitalsPanel'
import { ErrorBanner } from './ui/ErrorBanner'
import { progressLines, reportLines } from './ui/lines'
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

function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err))
}

function App() {
  const [state, setState] = useState<AppState>({ stage: 'IDLE' })
  const [url, setUrl] = useState('')
  const [inputError, setInputError] = useState<string | null>(null)
  // Increments on every run and on reset, so results from an abandoned run are ignored.
  const runRef = useRef(0)
  // In-memory cache of GitHub vitals (unauthenticated API allows 60 requests/hour).
  const vitalsCache = useRef(new Map<string, RepoVitals>())

  async function consult(
    vitals: RepoVitals,
    depRot: DepRotReport,
    isCurrent: () => boolean,
  ) {
    setState({ stage: 'CONSULTING', vitals, depRot })
    try {
      const report = await runAutopsy(vitals, depRot)
      if (isCurrent()) setState({ stage: 'RESULTS', vitals, depRot, report })
    } catch (err) {
      if (!isCurrent()) return
      if (err instanceof AutopsySchemaError) {
        const report = buildFallbackReport(vitals, depRot)
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
    if (!prefersReducedMotion()) {
      await new Promise((resolve) => setTimeout(resolve, STAGE_PAUSE_MS))
      if (!isCurrent()) return
    }

    await consult(vitals, SKIPPED_DEP_ROT, isCurrent)
  }

  /** ERROR_AI -> CONSULTING with the vitals already held; GitHub is not called again. */
  function handleRetry() {
    if (state.stage !== 'ERROR_AI') return
    const { vitals, depRot } = state
    const runId = ++runRef.current
    void consult(vitals, depRot, () => runRef.current === runId)
  }

  function handleReset() {
    runRef.current++
    setInputError(null)
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
          lines={reportLines(state.report, state.stage === 'FALLBACK')}
          typewriterActive
          label={state.stage === 'FALLBACK' ? 'Autopsy report (instrument readings only)' : 'Autopsy report'}
        />
      )}

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