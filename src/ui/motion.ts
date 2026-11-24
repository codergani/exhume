export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

/** True when the user asks for reduced motion. Safe where matchMedia is missing. */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia(REDUCED_MOTION_QUERY).matches
}

/** Subscribe to preference changes; returns an unsubscribe function. */
export function subscribeReducedMotion(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {}
  const mql = window.matchMedia(REDUCED_MOTION_QUERY)
  mql.addEventListener('change', onChange)
  return () => mql.removeEventListener('change', onChange)
}