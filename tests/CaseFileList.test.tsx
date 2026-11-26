// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CaseFileList } from '../src/ui/CaseFileList'
import type { CaseFile } from '../src/lib/caseFile'

function makeCase(id: string, repo: string, months: number, capturedAt: string): CaseFile {
  return {
    id,
    owner: 'acme',
    repo,
    capturedAt,
    license: 'Apache-2.0',
    source: { kind: 'fictional', readmeOrigin: 'written-for-sample' },
    vitals: {
      lastPushDate: '2024-01-01T00:00:00Z',
      archived: false,
      openIssueCount: 1,
      starCount: 2,
      monthsSinceLastPush: months,
    },
    forks: { status: 'skipped' },
    readme: { text: 'hello', truncated: false },
    report: {
      causeOfDeath: 'x',
      severity: 'stable',
      steps: [],
      generatedAt: capturedAt,
    },
  }
}

const alive = makeCase('alive-one', 'lamp', 7, '2025-06-15T12:00:00Z')
const dead = makeCase('dead-one', 'tomb', 30, '2025-07-01T08:00:00Z')

describe('CaseFileList', () => {
  it('shows the title and one button per case with the exact text', () => {
    render(<CaseFileList cases={[alive, dead]} onOpen={() => {}} />)
    expect(screen.getByRole('heading', { name: 'Saved case files' })).not.toBeNull()
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(2)
    expect(buttons[0].textContent).toBe('acme/lamp · HIBERNATING · captured 2025-06-15')
    expect(buttons[1].textContent).toBe('acme/tomb · DEAD · captured 2025-07-01')
  })

  it('calls onOpen with the clicked case', () => {
    const onOpen = vi.fn()
    render(<CaseFileList cases={[alive, dead]} onOpen={onOpen} />)
    fireEvent.click(screen.getAllByRole('button')[1])
    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(onOpen).toHaveBeenCalledWith(dead)
  })

  it('uses native buttons, which activate on Enter and Space', () => {
    render(<CaseFileList cases={[alive]} onOpen={() => {}} />)
    const button = screen.getByRole('button')
    expect(button.tagName).toBe('BUTTON')
    expect(button.getAttribute('type')).toBe('button')
  })

  it('renders nothing for an empty list', () => {
    const { container } = render(<CaseFileList cases={[]} onOpen={() => {}} />)
    expect(container.innerHTML).toBe('')
  })

  it('has no button whose accessible name matches /exhume/i', () => {
    render(<CaseFileList cases={[alive, dead]} onOpen={() => {}} />)
    expect(screen.queryAllByRole('button', { name: /exhume/i })).toHaveLength(0)
  })
})
