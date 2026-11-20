/**
 * Classifies a repository's health status from its vital signs.
 * Pure, deterministic function — no I/O, no side effects.
 * No imports from src/ui, src/github (other than the shared type), or src/ai.
 *
 * Rules evaluated in priority order:
 *   1. archived === true  OR  monthsSinceLastPush >= 24  =>  DEAD
 *   2. monthsSinceLastPush >= 12                         =>  DYING
 *   3. otherwise                                         =>  ALIVE
 */
import type { RepoVitals } from '../github/client'

export type RepoStatus = 'DEAD' | 'DYING' | 'ALIVE'

export function classifyStatus(vitals: RepoVitals): RepoStatus {
  if (vitals.archived || vitals.monthsSinceLastPush >= 24) return 'DEAD'
  if (vitals.monthsSinceLastPush >= 12) return 'DYING'
  return 'ALIVE'
}
