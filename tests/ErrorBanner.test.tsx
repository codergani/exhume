// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ErrorBanner } from '../src/ui/ErrorBanner'
import { AutopsyAiError, GitHubNotFoundError, GitHubRateLimitError } from '../src/errors'

describe('ErrorBanner', () => {
  it('rate limit: shows reset time, docs link and no Retry button', () => {
    const resetAt = new Date('2025-01-01T01:00:00Z')
    render(<ErrorBanner error={new GitHubRateLimitError(resetAt)} />)

    expect(screen.getByRole('alert').textContent).toContain(resetAt.toLocaleString())
    const link = screen.getByRole('link', { name: /rate-limit docs/i })
    expect(link.getAttribute('href')).toContain('docs.github.com')
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull()
  })

  it('not found: shows a not-found message and no Retry button', () => {
    render(<ErrorBanner error={new GitHubNotFoundError('https://api.github.com/repos/a/b')} />)
    expect(screen.getByRole('alert').textContent).toMatch(/no such grave/i)
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull()
  })

  it('AI error: shows the message and a Retry button that calls onRetry', () => {
    const onRetry = vi.fn()
    render(<ErrorBanner error={new AutopsyAiError('AI request failed: offline')} onRetry={onRetry} />)

    expect(screen.getByRole('alert').textContent).toContain('AI request failed: offline')
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('generic error: shows a network message and no Retry button', () => {
    render(<ErrorBanner error={new Error('Failed to fetch')} />)
    expect(screen.getByRole('alert').textContent).toContain('Failed to fetch')
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull()
  })
})