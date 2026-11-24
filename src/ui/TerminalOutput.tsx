import { useEffect, useState, useSyncExternalStore } from 'react'
import { prefersReducedMotion, subscribeReducedMotion } from './motion'

interface TerminalOutputProps {
  lines: string[]
  /** Reveal with a typewriter effect (ignored when reduced motion is preferred). */
  typewriterActive: boolean
  label?: string
}

const TICK_MS = 18
const CHARS_PER_TICK = 2

export function TerminalOutput({ lines, typewriterActive, label }: TerminalOutputProps) {
  const reduced = useSyncExternalStore(subscribeReducedMotion, prefersReducedMotion, () => false)
  const text = lines.join('\n')
  const animate = typewriterActive && !reduced
  const [revealed, setRevealed] = useState(0)

  useEffect(() => {
    if (!animate) return
    const id = setInterval(() => {
      setRevealed((n) => Math.min(n + CHARS_PER_TICK, text.length))
    }, TICK_MS)
    return () => clearInterval(id)
  }, [animate, text.length])

  const shown = animate ? text.slice(0, revealed) : text
  const typing = animate && shown.length < text.length

  return (
    <pre className="terminal" role={label ? 'region' : undefined} aria-label={label}>
      <span className="terminal-text" aria-hidden={typing}>
        {shown}
      </span>
      {typing && <span className="sr-only">{text}</span>}
      <span className="cursor" aria-hidden="true">
        {'\u2588'}
      </span>
    </pre>
  )
}