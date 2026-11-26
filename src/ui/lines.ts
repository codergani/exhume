import type { AutopsyReport } from '../ai/fallback'
import type { AppState } from '../appState'

export const FALLBACK_MARKER =
  'the spirits are silent \u2014 showing instrument readings only.'

const LINES = [
  '> fetching vitals from GitHub\u2026',
  '> examining the remains\u2026',
  '  dependency rot: skipped (analysis not available in this build)',
  '> consulting the spirits\u2026',
]

/** Staged progress lines for the current stage (Requirement 5.1). */
export function progressLines(stage: AppState['stage']): string[] {
  switch (stage) {
    case 'IDLE':
      return []
    case 'FETCHING':
    case 'ERROR_GITHUB':
      return LINES.slice(0, 1)
    case 'EXAMINING':
      return LINES.slice(0, 3)
    default:
      return LINES
  }
}

/** Terminal lines for a finished report; the fallback marker comes first when asked. */
export function reportLines(report: AutopsyReport, withMarker = false): string[] {
  const out: string[] = []
  if (withMarker) out.push(FALLBACK_MARKER, '')
  if (report.overview) {
    const one = (s: string) => s.replace(/\s+/g, ' ').trim()
    const { purpose, audience, quickStart } = report.overview
    out.push('OVERVIEW', `Purpose: ${one(purpose)}`, `Audience: ${one(audience)}`)
    if (quickStart.length > 0) {
      out.push('Quick start:')
      quickStart.forEach((step, i) => out.push(`  ${i + 1}. ${one(step)}`))
    }
    out.push('')
  }
  out.push('CAUSE OF DEATH', report.causeOfDeath, '', `SEVERITY: ${report.severity.toUpperCase()}`, '')
  out.push('RESURRECTION PLAN')
  for (const step of report.steps) {
    out.push(`${step.order}. ${step.action}`, `   ${step.rationale}`)
  }
  return out
}