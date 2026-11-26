import type { RepoVitals } from '../github/client'
import { statusLabel } from '../lib/statusLabel'

interface VitalsPanelProps {
  vitals: RepoVitals
  status: 'DEAD' | 'DYING' | 'ALIVE'
}

export function VitalsPanel({ vitals, status }: VitalsPanelProps) {
  const label = statusLabel(status, vitals.monthsSinceLastPush)
  const badgeClass =
    label === 'HIBERNATING' ? 'badge badge-hibernating' : `badge badge-${status.toLowerCase()}`
  return (
    <section className="vitals" aria-label="Vital signs">
      <h2>VITAL SIGNS</h2>
      <dl>
        <div>
          <dt>Last push</dt>
          <dd>{vitals.lastPushDate.slice(0, 10)}</dd>
        </div>
        <div>
          <dt>Archived</dt>
          <dd>{vitals.archived ? 'Yes' : 'No'}</dd>
        </div>
        <div>
          <dt>Open issues</dt>
          <dd>{vitals.openIssueCount}</dd>
        </div>
        <div>
          <dt>Stars</dt>
          <dd>{vitals.starCount}</dd>
        </div>
        <div>
          <dt>Months since push</dt>
          <dd>{vitals.monthsSinceLastPush}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>
            <span className={badgeClass}>{label}</span>
          </dd>
        </div>
      </dl>
    </section>
  )
}