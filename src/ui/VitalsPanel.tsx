import type { RepoVitals } from '../github/client'

interface VitalsPanelProps {
  vitals: RepoVitals
  status: 'DEAD' | 'DYING' | 'ALIVE'
}

export function VitalsPanel({ vitals, status }: VitalsPanelProps) {
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
            <span className={`badge badge-${status.toLowerCase()}`}>{status}</span>
          </dd>
        </div>
      </dl>
    </section>
  )
}