// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { VitalsPanel } from '../src/ui/VitalsPanel'
import type { RepoVitals } from '../src/github/client'

const vitals: RepoVitals = {
  lastPushDate: '2021-03-15T10:22:00Z',
  archived: false,
  openIssueCount: 142,
  starCount: 831,
  monthsSinceLastPush: 50,
}

describe('VitalsPanel', () => {
  it('renders all six fields', () => {
    render(<VitalsPanel vitals={vitals} status="DEAD" />)
    expect(screen.getByText('2021-03-15')).not.toBeNull() // YYYY-MM-DD
    expect(screen.getByText('No')).not.toBeNull() // archived
    expect(screen.getByText('142')).not.toBeNull() // open issues
    expect(screen.getByText('831')).not.toBeNull() // stars
    expect(screen.getByText('50')).not.toBeNull() // months
    expect(screen.getByText('DEAD')).not.toBeNull() // status
  })

  it('shows Yes when archived', () => {
    render(<VitalsPanel vitals={{ ...vitals, archived: true }} status="DEAD" />)
    expect(screen.getByText('Yes')).not.toBeNull()
  })

  it.each(['DEAD', 'DYING', 'ALIVE'] as const)('badge text matches status %s', (status) => {
    render(<VitalsPanel vitals={vitals} status={status} />)
    const badge = screen.getByText(status)
    expect(badge.className).toContain(`badge-${status.toLowerCase()}`)
  })
})

describe('VitalsPanel status label', () => {
  it.each([3, 11])('ALIVE at %i months shows HIBERNATING', (months) => {
    render(<VitalsPanel vitals={{ ...vitals, monthsSinceLastPush: months }} status="ALIVE" />)
    const badge = screen.getByText('HIBERNATING')
    expect(badge.className).toContain('badge-hibernating')
    expect(screen.queryByText('ALIVE')).toBeNull()
  })

  it('ALIVE at 2 months shows ALIVE', () => {
    render(<VitalsPanel vitals={{ ...vitals, monthsSinceLastPush: 2 }} status="ALIVE" />)
    expect(screen.getByText('ALIVE').className).toContain('badge-alive')
  })

  it.each(['DYING', 'DEAD'] as const)('%s at 5 months is unaffected', (status) => {
    render(<VitalsPanel vitals={{ ...vitals, monthsSinceLastPush: 5 }} status={status} />)
    expect(screen.getByText(status).className).toContain(`badge-${status.toLowerCase()}`)
  })
})
