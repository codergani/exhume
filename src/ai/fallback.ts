/**
 * Builds a deterministic AutopsyReport from vitals and dep-rot data.
 * Never throws. No network calls.
 */
import type { RepoVitals } from '../github/client'
import type { DepRotReport } from '../github/deps'
import { classifyStatus } from '../lib/classifyStatus'
import { statusLabel } from '../lib/statusLabel'
import type { ForkSummary } from '../lib/forks'

export interface RevivalStep {
  order: number
  action: string
  rationale: string
}

export interface ForkRecommendation {
  kind: 'adopt-fork' | 'revive-original'
  fork?: string // "owner/name"
  reason: string
}

export interface Overview {
  purpose: string
  audience: string
  quickStart: string[]
}

export interface AutopsyReport {
  causeOfDeath: string
  severity: 'critical' | 'serious' | 'stable'
  steps: RevivalStep[]
  generatedAt: string // ISO 8601
  recommendation?: ForkRecommendation
  overview?: Overview
}

/** "this month" for 0, never "0 months"; otherwise "N month(s) ago". */
function sincePush(months: number): string {
  if (months <= 0) return 'this month'
  return `${months} month${months === 1 ? '' : 's'} ago`
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/**
 * Neutral report for an ALIVE repository (0 to 11 months since the last push).
 * Never says dead, death or abandoned, and never writes "0 months".
 */
function aliveReport(
  vitals: RepoVitals,
  depRot: DepRotReport,
  forks: ForkSummary | undefined,
): AutopsyReport {
  const months = vitals.monthsSinceLastPush
  const hibernating = statusLabel('ALIVE', months) === 'HIBERNATING'
  const pushed = months <= 0 ? 'pushed this month' : `last pushed ${sincePush(months)}`
  const issues = plural(vitals.openIssueCount, 'open issue')

  const causeOfDeath = hibernating
    ? `Quiet: ${pushed}, with ${issues}. Watch for a push before the 12-month mark.`
    : `Active: ${pushed}, with ${issues}. Watch whether issues keep pace with pushes.`

  const hasOutdated = !depRot.skipped && depRot.outdatedDeps.length > 0
  const maxMajorsBehind = hasOutdated
    ? Math.max(...depRot.outdatedDeps.map((d) => d.majorsBehind))
    : 0

  const step2: RevivalStep = hasOutdated
    ? {
        order: 2,
        action: `Upgrade ${depRot.outdatedDeps.length} outdated dependencies`,
        rationale: `Dependencies are behind by up to ${plural(maxMajorsBehind, 'major version')}.`,
      }
    : vitals.openIssueCount > 0
      ? {
          order: 2,
          action: 'Review the open issues',
          rationale: `${issues} show where users need help next.`,
        }
      : {
          order: 2,
          action: 'Keep the issue tracker clear',
          rationale: 'There are 0 open issues; keep triage quick so it stays that way.',
        }

  const topFork = forks?.status === 'available' ? forks.top[0] : undefined
  const step3: RevivalStep = topFork
    ? {
        order: 3,
        action: `Compare with the fork ${topFork.owner}/${topFork.name}`,
        rationale: `It was pushed ${sincePush(topFork.monthsSincePush)} with ${plural(topFork.stars, 'star')}; check it for changes worth merging back.`,
      }
    : hibernating
      ? {
          order: 3,
          action: 'Plan the next push',
          rationale: `The repository was ${pushed}; a small release before the 12-month mark keeps it active.`,
        }
      : {
          order: 3,
          action: 'Keep the release rhythm',
          rationale: `The repository was ${pushed}; keep pushes and releases regular.`,
        }

  return {
    causeOfDeath,
    severity: 'stable',
    steps: [
      {
        order: 1,
        action: 'Assess community interest',
        rationale: `Star count (${vitals.starCount}) and ${issues} indicate the level of ongoing demand.`,
      },
      step2,
      step3,
    ],
    generatedAt: new Date().toISOString(),
  }
}

export function buildFallbackReport(
  vitals: RepoVitals,
  depRot: DepRotReport,
  forks?: ForkSummary,
): AutopsyReport {
  const status = classifyStatus(vitals)
  // ALIVE repositories get neutral wording; DEAD and DYING output is unchanged below.
  if (status === 'ALIVE') return aliveReport(vitals, depRot, forks)

  const severity: AutopsyReport['severity'] =
    status === 'DEAD' ? 'critical' : status === 'DYING' ? 'serious' : 'stable'

  let causeOfDeath: string
  if (vitals.archived) {
    causeOfDeath = 'Repository has been archived by its owner.'
  } else if (vitals.monthsSinceLastPush >= 24) {
    causeOfDeath = `No commits in ${vitals.monthsSinceLastPush} months.`
  } else if (vitals.monthsSinceLastPush >= 12) {
    causeOfDeath = `Activity has stalled for ${vitals.monthsSinceLastPush} months.`
  } else {
    causeOfDeath = 'Repository appears active but shows signs of dependency rot.'
  }

  const hasOutdated = !depRot.skipped && depRot.outdatedDeps.length > 0
  const maxMajorsBehind = hasOutdated
    ? Math.max(...depRot.outdatedDeps.map((d) => d.majorsBehind))
    : 0

  const step2: RevivalStep = hasOutdated
    ? {
        order: 2,
        action: `Upgrade ${depRot.outdatedDeps.length} outdated dependencies`,
        rationale: `Dependencies are behind by up to ${maxMajorsBehind} major version${maxMajorsBehind === 1 ? '' : 's'}.`,
      }
    : {
        order: 2,
        action: 'Audit the dependency tree',
        rationale:
          'No package.json analysis was available; a manual audit is needed.',
      }

  const topFork = forks?.status === 'available' ? forks.top[0] : undefined

  const step3: RevivalStep = topFork
    ? {
        order: 3,
        action: `Consider adopting the living fork ${topFork.owner}/${topFork.name}`,
        rationale: `It was pushed ${topFork.monthsSincePush} month${topFork.monthsSincePush === 1 ? '' : 's'} ago with ${topFork.stars} star${topFork.stars === 1 ? '' : 's'}. If the maintainer does not respond, a community fork is the most reliable revival path.`,
      }
    : {
        order: 3,
        action: 'File a maintainership issue or fork',
        rationale:
          'If no active maintainer responds within 30 days, a community fork is the most reliable revival path.',
      }

  const steps: RevivalStep[] = [
    {
      order: 1,
      action: 'Assess community interest',
      rationale: `Star count (${vitals.starCount}) and ${vitals.openIssueCount} open issue${vitals.openIssueCount === 1 ? '' : 's'} indicate the level of ongoing demand.`,
    },
    step2,
    step3,
  ]

  return {
    causeOfDeath,
    severity,
    steps,
    generatedAt: new Date().toISOString(),
  }
}
