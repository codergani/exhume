// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ForksPanel } from '../src/ui/ForksPanel'
import type { ForkResult, LivingFork } from '../src/lib/forks'

function makeFork(i: number): LivingFork {
  return {
    owner: `owner${i}`,
    name: `repo${i}`,
    htmlUrl: `https://github.com/owner${i}/repo${i}`,
    starCount: 100 + i,
    lastPushDate: `2025-0${i}-1${i}T10:00:00Z`,
    archived: false,
  }
}

function available(living: LivingFork[]): ForkResult {
  return { status: 'available', living, inspected: 30, livingTotal: living.length }
}

describe('ForksPanel', () => {
  it.each([1, 2, 3])('renders %i living fork(s) completely', (count) => {
    const living = Array.from({ length: count }, (_, i) => makeFork(i + 1))
    render(<ForksPanel result={available(living)} />)
    expect(screen.getAllByRole('link')).toHaveLength(count)
    for (const fork of living) {
      const link = screen.getByRole('link', { name: `${fork.owner}/${fork.name}` })
      expect(link.getAttribute('href')).toBe(fork.htmlUrl)
      expect(link.getAttribute('target')).toBe('_blank')
      expect(link.getAttribute('rel')).toContain('noopener')
      expect(link.getAttribute('rel')).toContain('noreferrer')
      expect(screen.getByText(`★ ${fork.starCount}`)).not.toBeNull()
      expect(screen.getByText(`${fork.starCount} stars`)).not.toBeNull()
      expect(screen.getByText(fork.lastPushDate.slice(0, 10))).not.toBeNull()
    }
  })

  it('renders at most 3 forks when given more', () => {
    const living = [1, 2, 3, 4, 5].map(makeFork)
    render(<ForksPanel result={available(living)} />)
    expect(screen.getAllByRole('link')).toHaveLength(3)
    expect(screen.queryByText('owner4/repo4')).toBeNull()
  })

  it('shows one line and no links when no living forks', () => {
    render(<ForksPanel result={available([])} />)
    expect(screen.getByText(/no living forks found/)).not.toBeNull()
    expect(screen.queryAllByRole('link')).toHaveLength(0)
  })

  it('shows the message with no button or link when unavailable', () => {
    render(<ForksPanel result={{ status: 'unavailable', message: 'the registry is sealed.' }} />)
    expect(screen.getByRole('status').textContent).toBe('the registry is sealed.')
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(screen.queryAllByRole('link')).toHaveLength(0)
  })

  it('renders nothing when skipped', () => {
    const { container } = render(<ForksPanel result={{ status: 'skipped' }} />)
    expect(container.innerHTML).toBe('')
  })
})
