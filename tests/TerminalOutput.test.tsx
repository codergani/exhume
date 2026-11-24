// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'
import { TerminalOutput } from '../src/ui/TerminalOutput'

function mockMatchMedia(reduced: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: reduced,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  })
}

const lines = ['CAUSE OF DEATH', 'No commits in 50 months.']
const full = lines.join('\n')

function visibleText(container: HTMLElement) {
  return container.querySelector('.terminal-text')?.textContent
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('TerminalOutput', () => {
  it('renders all lines immediately when typewriterActive is false', () => {
    mockMatchMedia(false)
    const { container } = render(<TerminalOutput lines={lines} typewriterActive={false} />)
    expect(visibleText(container)).toBe(full)
  })

  it('renders all lines immediately when reduced motion is preferred', () => {
    mockMatchMedia(true)
    const { container } = render(<TerminalOutput lines={lines} typewriterActive />)
    expect(visibleText(container)).toBe(full)
  })

  it('reveals text progressively when motion is allowed', () => {
    mockMatchMedia(false)
    const { container } = render(<TerminalOutput lines={lines} typewriterActive />)
    expect(visibleText(container)).toBe('')

    act(() => {
      vi.advanceTimersByTime(18 * 3)
    })
    const partial = visibleText(container) ?? ''
    expect(partial.length).toBeGreaterThan(0)
    expect(partial.length).toBeLessThan(full.length)

    act(() => {
      vi.advanceTimersByTime(10_000)
    })
    expect(visibleText(container)).toBe(full)
  })

  it('does not hide the full text from assistive tech while typing', () => {
    mockMatchMedia(false)
    const { container } = render(<TerminalOutput lines={lines} typewriterActive />)
    expect(container.querySelector('.sr-only')?.textContent).toBe(full)
    expect(container.querySelector('.terminal-text')?.getAttribute('aria-hidden')).toBe('true')
  })
})