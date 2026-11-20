# Implementation Plan: autopsy-core

## Overview

Build the Exhume MVP in strict dependency order: pure functions and their tests first, then the GitHub API client, then AI schema/fallback/provider, then UI components, then top-level orchestration. The optional dependency-rot task (Requirement 3) is listed last and can be skipped for a faster MVP.

## Tasks

- [ ] 1. Project scaffolding
  - Install `vitest`, `@vitest/coverage-v8`, `fast-check`, `zod`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom` as dev dependencies
  - Create `vitest.config.ts` configuring the `jsdom` environment and `globals: true`; add `"test": "vitest --run"` and `"test:watch": "vitest"` scripts to `package.json`
  - Create the `tests/` directory at the workspace root
  - _Requirements: all_

- [ ] 2. Typed error classes
  - Create `src/errors.ts` with the four exported error classes: `GitHubRateLimitError` (carries `resetAt: Date`), `GitHubNotFoundError`, `AutopsyAiError` (carries optional `statusCode: number`), `AutopsySchemaError`
  - Each class must set `this.name` correctly and call `super(message)`
  - _Requirements: 6.1, 6.2_

- [x] 3. `src/lib/parseRepoUrl.ts` â€” pure function + unit tests
  - Implement and export `parseRepoUrl(input: string): { owner: string; repo: string } | null`
  - Handle HTTPS and SSH forms, optional `.git` suffix, trailing slash, extra path segments; return `null` for all other inputs
  - Create `tests/parseRepoUrl.test.ts` with Vitest unit tests: empty string, plain text, `ftp://` URL, correct host but no repo segment, each valid URL form
  - _Requirements: 1.1, 1.2_

- [x] 4. `tests/parseRepoUrl.pbt.ts` â€” property-based tests for parseRepoUrl
  - Write fast-check property tests for **Property 1** (non-GitHub inputs â†’ null) and **Property 2** (all URL variants for the same owner/repo â†’ identical `{owner, repo}`)
  - Define a `validOwnerRepoArb` arbitrary and a `buildUrlVariants` helper; annotate each test with its property number and requirement reference
  - _Requirements: 1.1, 1.2_

- [x] 5. `src/lib/classifyStatus.ts` â€” pure function + unit tests
  - Implement and export `classifyStatus(vitals: RepoVitals): 'DEAD' | 'DYING' | 'ALIVE'` using the three-rule priority order from the design
  - Import `RepoVitals` from `src/github/client.ts` (create a minimal type-only stub `src/github/client.ts` exporting the `RepoVitals` interface if that file does not yet exist)
  - Create `tests/classifyStatus.test.ts` covering boundary values: `monthsSinceLastPush` of 11, 12, 23, 24, and `archived` true/false combinations
  - _Requirements: 2.2, 2.3, 2.4_

- [x] 6. `tests/classifyStatus.pbt.ts` â€” property-based tests for classifyStatus
  - Define shared arbitraries `repoVitalsArb`, `deadVitalsArb`, `dyingVitalsArb`, `aliveVitalsArb` in `tests/arbitraries.ts`
  - Write fast-check property tests for **Properties 3â€“7**: totality, DEAD condition, DYING condition, ALIVE condition, determinism
  - Annotate each test with its property number and requirement reference
  - _Requirements: 2.2, 2.3, 2.4_

- [ ] 7. `src/github/client.ts` â€” fetchRepoVitals
  - Define and export the `RepoVitals` interface (remove the stub if one was created in task 5)
  - Implement and export `fetchRepoVitals(owner: string, repo: string): Promise<RepoVitals>` hitting `https://api.github.com/repos/{owner}/{repo}`; handle 403/429 â†’ `GitHubRateLimitError`, 404 â†’ `GitHubNotFoundError`, other non-2xx â†’ generic `Error`; compute `monthsSinceLastPush` using `Math.floor`
  - Create `tests/client.test.ts` with mocked `fetch` covering 200 (verify all five fields map correctly), 403 with `X-RateLimit-Reset` header, 429, and 404
  - _Requirements: 2.1, 6.1_

- [ ] 8. `src/ai/schema.ts` â€” Zod schema
  - Implement and export `revivalStepSchema` and `autopsyReportSchema` using Zod exactly as specified in the design (`.min(3).max(7)` on `steps`, enum for `severity`, positive int for `order`)
  - _Requirements: 4.1_

- [ ] 9. `src/ai/fallback.ts` â€” deterministic fallback report
  - Implement and export `buildFallbackReport(vitals: RepoVitals, depRot: DepRotReport): AutopsyReport` following the three-step algorithm in the design; it must never throw
  - Import `DepRotReport` from `src/github/deps.ts` (create a minimal type-only stub if that file does not yet exist); import `classifyStatus` from `src/lib/classifyStatus.ts`
  - Create `tests/fallback.test.ts` covering all three severity paths and both dep-rot branch conditions; assert `steps.length === 3` and contiguous `order` values
  - _Requirements: 4.2, 6.2_

- [ ] 10. `src/ai/provider.ts` â€” Firebase AI Logic, schema validation, retry
  - Export `INFERENCE_MODE = 'cloud' as const`
  - Implement and export `runAutopsy(vitals: RepoVitals, depRot: DepRotReport, apiKey: string): Promise<AutopsyReport>` using Firebase AI Logic; build the structured JSON prompt from the design's AI Prompt Contract; apply `autopsyReportSchema.safeParse()` and retry once on schema failure before throwing `AutopsySchemaError`; throw `AutopsyAiError` on transport/HTTP failure; append `generatedAt` only after successful validation
  - Create `tests/provider.test.ts` with mocked Firebase AI responses: valid on first call, schema failure then success, schema failure twice, transport failure
  - _Requirements: 4.1, 4.2, 6.3_

- [ ] 11. Checkpoint â€” run all tests
  - Run `npm test` and ensure every test in `tests/` passes before proceeding. Ask the user if any test is failing or unclear.

- [ ] 12. `src/ui/VitalsPanel.tsx` â€” stateless component
  - Implement `VitalsPanel` accepting `{ vitals: RepoVitals; status: 'DEAD' | 'DYING' | 'ALIVE' }` props; render last push date as `YYYY-MM-DD`, archived flag, open issue count, star count, months since last push, and a status badge using `--accent` and `--border` CSS variables
  - Create `tests/VitalsPanel.test.tsx` asserting all six fields render and the status badge text matches the status prop
  - _Requirements: 2.1, 2.2, 2.3_

- [ ] 13. `src/ui/ErrorBanner.tsx` and `src/ui/TerminalOutput.tsx`
  - Implement `ErrorBanner` accepting `{ error: GitHubRateLimitError | GitHubNotFoundError | AutopsyAiError; onRetry?: () => void }`: show reset time + docs link for rate-limit, not-found message otherwise, and a Retry button only for `AutopsyAiError`
  - Implement `TerminalOutput` accepting `{ lines: string[]; typewriterActive: boolean }`: render inside `<pre>` with `--mono`/`--bg` variables; skip animation when `prefers-reduced-motion: reduce` is detected via `window.matchMedia`
  - Create `tests/ErrorBanner.test.tsx` covering each error variant and the Retry button callback; create `tests/TerminalOutput.test.tsx` asserting immediate render when `typewriterActive` is false and when reduced motion is mocked
  - _Requirements: 5.1, 5.2, 5.3, 6.1, 6.2_

- [ ] 14. `src/App.tsx` â€” state machine orchestration
  - Replace the existing `App.tsx` with the full state machine: `useState<AppState>`, `handleSubmit` (parse URL â†’ FETCHING â†’ EXAMINING â†’ CONSULTING â†’ RESULTS/ERROR_AI/FALLBACK), `handleRetry` (ERROR_AI â†’ CONSULTING without re-fetching), and `handleReset` (any terminal state â†’ IDLE)
  - Render URL input + session-only API key input in IDLE; `TerminalOutput` with stage-appropriate lines in all non-IDLE states; `VitalsPanel` once vitals are present; `ErrorBanner` in ERROR_GITHUB and ERROR_AI; fallback marker line in FALLBACK
  - Catch all async errors and transition to the correct error state; call `buildFallbackReport` synchronously on `AutopsySchemaError`
  - _Requirements: 1.1, 1.2, 4.1, 4.2, 5.1, 5.2, 5.3, 6.1, 6.2, 6.3_

- [ ] 15. Final checkpoint â€” full test suite
  - Run `npm test`; fix any failures. Ask the user if anything is unclear before marking this done.

- [ ]* 16. `src/github/deps.ts` â€” dependency rot (OPTIONAL)
  - Define and export the `OutdatedDep` and `DepRotReport` interfaces (remove any stub created in task 9)
  - Implement and export `fetchDepRot(owner: string, repo: string): Promise<DepRotReport>` using the GitHub contents API + npm registry; handle 404 as `skipped: true`; silently skip individual npm failures; strip version range prefixes to compute `majorsBehind`
  - Create `tests/deps.test.ts` with mocked fetch covering: 200 with a `package.json` containing one outdated and one current dependency, 404 (verify `skipped: true`), and an individual npm fetch failure (verify graceful skip)
  - Wire `fetchDepRot` into `App.tsx` in the EXAMINING stage (replace the stub/no-op if one was used)
  - _Requirements: 3.1, 3.2_

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP (the app works without dependency-rot data; `DepRotReport` returns `skipped: true` from a stub)
- File paths for pure functions follow the steering rules: `src/lib/` for `parseRepoUrl` and `classifyStatus`; `src/github/` for the API client; the design.md `src/github/` paths for pure functions are overridden here
- Each task references specific requirements for traceability
- Property tests validate universal correctness properties (Properties 1â€“7 from the design); unit tests validate concrete examples and boundaries

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1"] },
    { "id": 1, "tasks": ["2"] },
    { "id": 2, "tasks": ["3", "5"] },
    { "id": 3, "tasks": ["4", "6", "7", "8"] },
    { "id": 4, "tasks": ["9"] },
    { "id": 5, "tasks": ["10"] },
    { "id": 6, "tasks": ["12", "13"] },
    { "id": 7, "tasks": ["14"] },
    { "id": 8, "tasks": ["16"] }
  ]
}
```
