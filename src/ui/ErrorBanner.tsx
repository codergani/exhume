import type { ReactNode } from 'react'
import { AutopsyAiError, GitHubNotFoundError, GitHubRateLimitError } from '../errors'

interface ErrorBannerProps {
  error: Error
  /** Provided only for AutopsyAiError; re-enters CONSULTING without a GitHub fetch. */
  onRetry?: () => void
}

const RATE_LIMIT_DOCS =
  'https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api'

export function ErrorBanner({ error, onRetry }: ErrorBannerProps) {
  let body: ReactNode

  if (error instanceof GitHubRateLimitError) {
    body = (
      <>
        <p>
          The GitHub registry of the dead is closed to you until{' '}
          <strong>{error.resetAt.toLocaleString()}</strong>.
        </p>
        <p>
          Wait until then and start over.{' '}
          <a href={RATE_LIMIT_DOCS} target="_blank" rel="noopener noreferrer">
            GitHub rate-limit docs
          </a>
        </p>
      </>
    )
  } else if (error instanceof GitHubNotFoundError) {
    body = (
      <>
        <p>No such grave. GitHub has no record of this repository.</p>
        <p>Check the owner and repository name, then start over.</p>
      </>
    )
  } else if (error instanceof AutopsyAiError) {
    body = (
      <>
        <p>The spirits did not answer. {error.message}</p>
        <p>The vitals above are intact. Retry, or start over.</p>
        {onRetry && (
          <button type="button" onClick={onRetry}>
            Retry
          </button>
        )}
      </>
    )
  } else {
    body = (
      <>
        <p>The connection to GitHub failed. {error.message}</p>
        <p>Check your network, then start over.</p>
      </>
    )
  }

  return (
    <div className="error-banner" role="alert">
      <strong className="error-title">{'\u26A0'} ERROR</strong>
      {body}
    </div>
  )
}