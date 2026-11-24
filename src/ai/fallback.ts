/**
 * Builds a deterministic AutopsyReport from vitals and dep-rot data.
 * Never throws. No network calls.
 */
import type { RepoVitals } from '../github/client'
import type { DepRotReport } from '../github/deps'
import { classifyStatus } from '../lib/classifyStatus'

export interface RevivalStep {
  order: number
  action: string
  rationale: string
}

export interface AutopsyReport {
  causeOfDeath: string
  severity: 'critical' | 'serious' | 'stable'
  steps: RevivalStep[]
  generatedAt: string // ISO 8601
}

export function buildFallbackReport(vitals: RepoVitals, depRot: DepRotReport): AutopsyReport {
  const status = classifyStatus(vitals)

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

  const steps: RevivalStep[] = [
    {
      order: 1,
      action: 'Assess community interest',
      rationale: `Star count (${vitals.starCount}) and ${vitals.openIssueCount} open issue${vitals.openIssueCount === 1 ? '' : 's'} indicate the level of ongoing demand.`,
    },
    step2,
    {
      order: 3,
      action: 'File a maintainership issue or fork',
      rationale:
        'If no active maintainer responds within 30 days, a community fork is the most reliable revival path.',
    },
  ]

  return {
    causeOfDeath,
    severity,
    steps,
    generatedAt: new Date().toISOString(),
  }
}
