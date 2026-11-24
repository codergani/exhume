import type { RepoVitals } from './github/client'
import type { DepRotReport } from './github/deps'
import type { AutopsyReport } from './ai/fallback'
import type { AutopsyAiError } from './errors'

/** Application state machine (design.md, State Machine). */
export type AppState =
  | { stage: 'IDLE' }
  | { stage: 'FETCHING' }
  | { stage: 'EXAMINING'; vitals: RepoVitals }
  | { stage: 'CONSULTING'; vitals: RepoVitals; depRot: DepRotReport }
  | { stage: 'RESULTS'; vitals: RepoVitals; depRot: DepRotReport; report: AutopsyReport }
  // GitHubRateLimitError | GitHubNotFoundError | any other fetch failure
  | { stage: 'ERROR_GITHUB'; error: Error }
  | { stage: 'ERROR_AI'; vitals: RepoVitals; depRot: DepRotReport; error: AutopsyAiError }
  | { stage: 'FALLBACK'; vitals: RepoVitals; depRot: DepRotReport; report: AutopsyReport }