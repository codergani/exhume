import type { ForkResult } from '../lib/forks'

interface ForksPanelProps {
  result: ForkResult
}

export function ForksPanel({ result }: ForksPanelProps) {
  if (result.status === 'skipped') return null

  if (result.status === 'unavailable') {
    return (
      <p className="forks-note" role="status">
        {result.message}
      </p>
    )
  }

  if (result.living.length === 0) {
    return <p className="forks-note">no living forks found among the graves inspected.</p>
  }

  return (
    <section className="forks" aria-label="Living forks">
      <h2>LIVING FORKS</h2>
      <ul>
        {result.living.slice(0, 3).map((fork) => (
          <li key={fork.htmlUrl}>
            <a href={fork.htmlUrl} target="_blank" rel="noopener noreferrer">
              {fork.owner}/{fork.name}
            </a>
            <span aria-hidden="true">★ {fork.starCount}</span>
            <span className="sr-only">{fork.starCount} stars</span>
            <span>{fork.lastPushDate.slice(0, 10)}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
