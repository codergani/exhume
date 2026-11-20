// Type-only stub — full implementation in task 7.
// classifyStatus imports RepoVitals from here to match the design's type ownership.

export interface RepoVitals {
  lastPushDate: string        // ISO 8601
  archived: boolean
  openIssueCount: number
  starCount: number
  monthsSinceLastPush: number // non-negative integer
}
