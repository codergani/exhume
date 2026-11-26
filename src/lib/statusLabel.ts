/**
 * Maps a status and months since last push to the label shown in the VitalsPanel.
 * Presentational only: classifyStatus is unchanged and still classifies these repos as ALIVE.
 * Pure, deterministic function. Imports nothing from src/ui, src/github or src/ai.
 */
import type { RepoStatus } from './classifyStatus'

export type StatusLabel = RepoStatus | 'HIBERNATING'

export function statusLabel(status: RepoStatus, monthsSinceLastPush: number): StatusLabel {
  if (status === 'ALIVE' && monthsSinceLastPush >= 3 && monthsSinceLastPush <= 11) {
    return 'HIBERNATING'
  }
  return status
}
