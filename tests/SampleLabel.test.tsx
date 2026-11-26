// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SampleLabel } from '../src/ui/SampleLabel'

describe('SampleLabel', () => {
  it('shows the fictional text with the date', () => {
    render(<SampleLabel capturedAt="2025-06-15T12:00:00Z" kind="fictional" />)
    const note = screen.getByRole('note')
    expect(note.textContent).toBe(
      'saved sample · frozen snapshot from 2025-06-15, not live data · fictional repository',
    )
  })

  it('omits the fictional suffix for captured samples', () => {
    render(<SampleLabel capturedAt="2025-06-15T12:00:00Z" kind="captured" />)
    const note = screen.getByRole('note')
    expect(note.textContent).toBe('saved sample · frozen snapshot from 2025-06-15, not live data')
    expect(note.textContent).not.toContain('fictional')
  })
})
