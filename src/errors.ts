/**
 * Typed error classes for the Exhume application.
 * No dependencies on other src modules.
 */

/** Thrown when the GitHub API returns 403 or 429 (rate limit exceeded). */
export class GitHubRateLimitError extends Error {
  readonly resetAt: Date
  constructor(resetAt: Date) {
    super(`GitHub API rate limit exceeded. Resets at ${resetAt.toISOString()}.`)
    this.name = 'GitHubRateLimitError'
    this.resetAt = resetAt
  }
}

/** Thrown when the GitHub API returns 404 for a repository lookup. */
export class GitHubNotFoundError extends Error {
  constructor(url: string) {
    super(`Repository not found: ${url}`)
    this.name = 'GitHubNotFoundError'
  }
}

/** Thrown when the AI provider call fails due to a transport or HTTP error. */
export class AutopsyAiError extends Error {
  readonly statusCode?: number
  constructor(message: string, statusCode?: number) {
    super(message)
    this.name = 'AutopsyAiError'
    this.statusCode = statusCode
  }
}

/** Thrown when the AI response does not match the expected schema after one retry. */
export class AutopsySchemaError extends Error {
  constructor(raw: unknown) {
    super(`AI response did not match expected schema. Raw: ${JSON.stringify(raw)}`)
    this.name = 'AutopsySchemaError'
  }
}
