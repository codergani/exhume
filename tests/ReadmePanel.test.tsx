// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ReadmePanel } from '../src/ui/ReadmePanel'

const url = 'https://github.com/o/r#readme'

describe('ReadmePanel', () => {
  it('shows the text in a focusable, named region', () => {
    render(<ReadmePanel result={{ status: 'available', text: 'hello readme', truncated: false, url }} />)
    const region = screen.getByRole('region', { name: 'README text, scrollable' })
    expect(region.getAttribute('tabindex')).toBe('0')
    expect(region.textContent).toBe('hello readme')
  })

  it('renders exactly one safe external link', () => {
    const { container } = render(
      <ReadmePanel result={{ status: 'available', text: 'x', truncated: false, url }} />,
    )
    const links = container.querySelectorAll('a')
    expect(links).toHaveLength(1)
    expect(links[0].getAttribute('href')).toBe(url)
    expect(links[0].getAttribute('target')).toBe('_blank')
    expect(links[0].getAttribute('rel')).toContain('noopener')
    expect(links[0].getAttribute('rel')).toContain('noreferrer')
  })

  it('shows the truncation note only when truncated', () => {
    const { rerender } = render(
      <ReadmePanel result={{ status: 'available', text: 'x', truncated: false, url }} />,
    )
    expect(screen.queryByText(/cut at 6000 characters/)).toBeNull()
    rerender(<ReadmePanel result={{ status: 'available', text: 'x', truncated: true, url }} />)
    expect(screen.getByText(/cut at 6000 characters/)).not.toBeNull()
  })

  it('renders HTML-looking text literally', () => {
    const text = '<script>alert(1)</script><a href="http://evil">x</a>'
    const { container } = render(
      <ReadmePanel result={{ status: 'available', text, truncated: false, url }} />,
    )
    expect(screen.getByText(text)).not.toBeNull()
    expect(container.querySelector('script')).toBeNull()
    const links = container.querySelectorAll('a')
    expect(links).toHaveLength(1)
    expect(links[0].getAttribute('href')).toBe(url)
  })

  it('unavailable renders only the message', () => {
    const { container } = render(
      <ReadmePanel result={{ status: 'unavailable', message: 'no README found.' }} />,
    )
    expect(screen.getByText('no README found.')).not.toBeNull()
    expect(container.querySelector('a')).toBeNull()
    expect(container.querySelector('button')).toBeNull()
    expect(screen.queryByRole('region')).toBeNull()
  })
})
