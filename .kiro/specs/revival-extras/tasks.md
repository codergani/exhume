# Implementation Plan: revival-extras

## Overview

Two additions to autopsy-core, built in this order: pure fork functions with tests, the forks fetch, the schema/fallback/provider changes, the ForksPanel, then App wiring. The fork finder is complete and shippable after task 7 and is verified at the checkpoint (task 8). The Kiro spec export (tasks 9 and 10) is optional and can be cut without affecting the fork finder.

Constraints for every task: no new dependencies, no backend, no accounts. Do not modify `requirements.md` or `design.md` of this spec, and do not modify any file under `.kiro/specs/autopsy-core/`. New pure modules in `src/lib` import nothing from `src/ui`, `src/github` or `src/ai`. The AppState stages and transitions, the AI Retry behaviour and the fallback marker line stay unchanged.

## Tasks

- [x] 1. `src/lib/forks.ts` - pure fork functions + example tests
  - Export the types `ForkCandidate` (owner, name, htmlUrl, starCount, lastPushDate, archived), `LivingFork`, `ForkResult` (`skipped` | `available` with living, inspected, livingTotal | `unavailable` with message) and `ForkSummary` (`available` with livingCount and top | `unavailable`), defined inside `src/lib`
  - Implement `monthsSince(iso, now)` as `Math.floor((now - pushed) / (1000*60*60*24*30.44))`, clamped at 0
  - Implement `selectLivingForks(forks, originalLastPush, now)`: keep forks that are not archived, have fewer than 12 months since last push, and have a last push strictly later than the original's; order by stars descending, then last push descending, then owner name ascending (case-insensitive), keeping input order if still tied; return at most 3; do not mutate the input
  - Implement `buildForkSummary(result, now)`: `skipped` and `unavailable` both give `{ status: 'unavailable' }` (never a count of zero); `available` gives `livingCount` equal to `livingTotal` and `top` entries with only owner, name, stars and monthsSincePush
  - Create `tests/forks.test.ts` with example tests: archived excluded, stale excluded, not later than the original excluded (including an equal timestamp), 11 vs 12 months boundary, both tie-break levels, cap at 3, same input called twice gives equal output, input not mutated; summary examples for skipped, unavailable, available with zero living, and available mirroring only the allowed fields
  - _Requirements: 1.3, 1.4, 1.5, 1.6, 1.7, 3.1, 3.2_

- [x] 2. Property-based test for living-fork selection
  - Create `tests/forks.pbt.test.ts` with ONE fast-check property over arbitrary fork lists, original last-push dates and reference dates: the result has at most 3 items; every item is not archived, has fewer than 12 months since last push, and has a last push strictly later than the original's; and the result is ordered by stars descending, then last push descending, then owner ascending (case-insensitive)
  - Define the fork arbitrary inside this test file (do not edit `tests/arbitraries.ts`); this is one of only two property-based tests in this spec
  - _Requirements: 1.3, 1.4, 1.5_

- [x] 3. `src/github/forks.ts` - fetchForks
  - Implement `fetchForks(owner, repo): Promise<ForkCandidate[]>` calling `GET https://api.github.com/repos/{owner}/{repo}/forks?sort=stargazers&per_page=30` with header `Accept: application/vnd.github+json` and no authentication
  - Map `owner.login`, `name`, `html_url`, `stargazers_count`, `pushed_at` and `archived` to the `ForkCandidate` fields; import the type from `src/lib/forks`
  - On 403 or 429 throw `GitHubRateLimitError` (reuse `src/errors.ts`) using the `X-RateLimit-Reset` header the same way `fetchRepoVitals` does; on any other non-2xx throw a generic `Error` with the status in the message
  - Create `tests/forksClient.test.ts` with mocked `fetch`: 200 mapping, request URL contains `sort=stargazers` and `per_page=30`, 403 with reset header, 429, and 500
  - _Requirements: 1.1, 4.1, 4.2_

- [x] 4. Optional recommendation in the schema and fork mention in the fallback report
  - In `src/ai/schema.ts` add an optional `recommendation` object to `autopsyReportSchema`: `kind` (`adopt-fork` or `revive-original`), optional `fork` (`owner/name`) and `reason`; existing steps validation is unchanged
  - In `src/ai/fallback.ts` add the optional `recommendation` field to `AutopsyReport` and give `buildFallbackReport` an optional third parameter `forks?: ForkSummary`; when `forks.status` is `available` and `top` is not empty, step 3 names `top[0]` as `owner/name`, still exactly 3 steps with orders 1, 2, 3; in every other case (omitted, `unavailable`, or `available` with an empty `top`) the output must be identical to today's
  - Create `tests/schema.test.ts`: a reply without `recommendation` validates, a valid `adopt-fork` and a valid `revive-original` validate, an unknown `kind` is rejected
  - Add cases to `tests/fallback.test.ts` without changing the existing cases: the 2-argument result equals the results with `undefined`, `unavailable` and empty-top summaries (compare with fake timers so `generatedAt` is equal), and the top fork's `owner/name` appears when one exists
  - _Requirements: 3.4, 3.5, 3.6, 3.7_

- [x] 5. `src/ai/provider.ts` - fork summary in the payload and recommendation handling
  - Give `runAutopsy` an optional third parameter `forks?: ForkSummary`; the prompt JSON becomes `{ vitals, deps, forks }` with `forks` defaulting to `{ status: 'unavailable' }`; the payload carries no source code, file contents or commit messages
  - Extend the system instruction with one or two sentences: the model may add an optional `recommendation` naming one of the listed forks (`adopt-fork`) or `revive-original`, and should omit it if unsure
  - After schema validation, drop the whole `recommendation` field when `kind` is `adopt-fork` and `fork` is missing or is not one of the supplied `top` forks (compare `owner/name` case-insensitively); this includes the case where forks were unavailable; a `revive-original` recommendation and a valid fork recommendation are kept
  - Keep the schema retry, fence stripping, transient backoff and `MAX_ATTEMPTS` unchanged
  - In `tests/provider.test.ts` change ONLY the existing prompt-keys assertion to expect `['deps', 'forks', 'vitals']`; add new tests: the fork summary is sent as given, `forks` defaults to unavailable when omitted, a reply without `recommendation` is accepted, an invented fork drops the whole recommendation, a listed fork is kept, `revive-original` is kept
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 7.4, 7.5_

- [x] 6. `src/ui/ForksPanel.tsx` - show the living forks
  - Implement `ForksPanel({ result: ForkResult })`: `skipped` renders nothing; `available` with living forks renders up to 3 entries, each with a link (`rel="noopener noreferrer"`, `target="_blank"`), the star count and the last push as `YYYY-MM-DD`; `available` with none renders one in-theme line saying no living forks were found; `unavailable` renders its one-line message with no button
  - No timers or animation, so the markup is identical when reduced motion is preferred; add small styles to `src/ui/theme.css` using the existing `--crypt-*` variables so text stays readable
  - Create `tests/ForksPanel.test.tsx` (this folds the render-completeness property into example tests): 1, 2 and 3 forks each show link, `rel`, stars and date; zero living shows the one line; `unavailable` shows the message and no button; `skipped` renders nothing
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 4.4_

- [x] 7. `src/App.tsx` - wire the fork finder into the flow
  - After vitals are fetched, when `classifyStatus(vitals)` is DEAD or DYING call `fetchForks` during the existing EXAMINING phase; when ALIVE make no forks call and keep the result `skipped`
  - Wrap the forks step in try/catch: any failure becomes `{ status: 'unavailable', message }` with one in-theme line; for `GitHubRateLimitError` include the reset time in local time format and what to do next; never set ERROR_GITHUB or ERROR_AI and never block CONSULTING
  - On success build the `ForkResult` with `selectLivingForks` (using the original's `lastPushDate` and the current time), keeping `inspected` and `livingTotal`
  - Hold the `ForkResult` in separate state (not in `AppState`) and cache it in memory per lowercased `owner/repo`; `handleRetry` reuses the held result and never calls `fetchForks`; `handleReset` clears the current result but keeps the cache; keep the stale-run guard
  - Pass `buildForkSummary(result, now)` to `runAutopsy` and to `buildFallbackReport`
  - Render `ForksPanel` from CONSULTING onward, above the report, and keep it visible in ERROR_AI, RESULTS and FALLBACK; leave `src/ui/lines.ts` and `src/appState.ts` unchanged
  - In `tests/App.test.tsx` add `vi.mock('../src/github/forks')` to the existing mock setup (a setup line only; no existing assertion changes) so existing DEAD-repo tests do not hit the network; add tests: forks appear before the report for a DEAD repo, `fetchForks` is not called for an ALIVE repo, a forks failure shows one line and the report still appears with no error state, a rate limit shows the reset time, AI Retry does not call `fetchForks` again, `runAutopsy` receives the fork summary, and the fallback report names the top fork
  - _Requirements: 1.1, 1.2, 2.1, 2.3, 3.1, 3.2, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 7.5, 7.7_

- [x] 8. Checkpoint - fork finder is shippable
  - Run `npm test`, `npm run lint` and `npm run build`; all must pass, including every existing test
  - Confirm with `git diff` that the only changed existing assertion is the provider prompt-keys assertion, and that the only other edit to an existing test is the added `fetchForks` mock line in `tests/App.test.tsx`
  - Confirm nothing under `.kiro/specs/autopsy-core/` changed and `package.json` has no new dependencies
  - Ask the user to smoke-test a DEAD repo in the browser (forks listed before the plan) and wait for approval before starting the optional export tasks

- [ ]* 9. `src/lib/specExport.ts` - pure spec generators (OPTIONAL)
  - Define `ExportableReport`, `ExportInput` and the recommendation type inside `src/lib/specExport.ts` (structurally compatible with `AutopsyReport`; no imports from ui, github or ai)
  - Implement `toSingleLine(text)`: collapse all whitespace and newlines to single spaces, trim, backslash-escape leading `-`, `*`, `+`, `#`, `>`, a number followed by `.` or `)`, and `[ ]` / `[x]`, escape backtick fences; an empty result becomes `(no detail provided)`
  - Implement `buildTasksMd(input)`: `# Implementation Plan: owner/repo`, `## Overview`, `## Tasks`, then exactly one `- [ ] N. <action>` line per step in order, each followed by one `  - <rationale>` line
  - Implement `buildRequirementsMd(input)`: the template in design.md with one `### Requirement` per step plus a final `Resurrection path` requirement only when a recommendation exists; no `Date.now()`, no `new Date()` without an argument and no randomness; the only date shown is `report.generatedAt`
  - Create `tests/specExport.test.ts` with example tests: structure of both files, an exported fallback report, byte-identical output on repeat, newline normalisation, Markdown neutralisation, empty text becomes the placeholder, the recommendation is reflected when present and the files are valid without it, one Requirement per step plus the final one
  - Create `tests/specExport.pbt.test.ts` with ONE fast-check property: for any report with N steps (3 to 7), including step text with newlines and Markdown markers, `buildTasksMd` contains exactly N lines matching `- [ ] `; this is the second and last property-based test in this spec
  - _Requirements: 5.7, 5.8, 5.9, 5.10, 5.11, 5.12, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_

- [ ]* 10. `src/ui/download.ts`, `src/ui/ExportButtons.tsx` and App wiring (OPTIONAL)
  - Implement `downloadTextFile(filename, content)` with a Blob (`text/markdown;charset=utf-8`), an object URL and a temporary anchor click, then revoke the URL; no network request and no new package
  - Implement `ExportButtons` with two separate buttons, "Export requirements.md" and "Export tasks.md"; each click builds one file and calls `downloadTextFile` exactly once, then shows one `role="status"` line naming that file; no click ever triggers two downloads
  - Render `ExportButtons` in `src/App.tsx` only in RESULTS and FALLBACK, building the input from owner, repo, status, vitals and the report
  - Create `tests/ExportButtons.test.tsx` (mock `downloadTextFile`): exactly one call per click with the right filename, the status line names the file, two clicks give two separate single-file calls; add `tests/App.test.tsx` cases: buttons are hidden in every stage except RESULTS and FALLBACK and shown for a fallback report
  - Manual check: generate one sample `requirements.md` and `tasks.md` from the builders (outside the repo, not committed), run `validate_spec_format` on both, and report the results to the user
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.9, 5.13, 5.14, 7.1, 7.2_

## Notes

- Tasks marked with `*` are optional. Cutting tasks 9 and 10 leaves the fork finder complete and tested.
- Only two property-based tests exist in this spec: living-fork selection (task 2) and tasks-equal-steps for the export (task 9). All other properties from design.md are covered by example tests.
- design.md lists more property-based tests than this plan builds; this plan follows the user's later decision to reduce them to two.
- The only existing test assertion that may change is the provider prompt-keys assertion (task 5). Task 7 adds one mock setup line to `tests/App.test.tsx` and changes no assertion.
- Each task references the requirements it satisfies for traceability.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1"] },
    { "id": 1, "tasks": ["2", "3", "4", "6"] },
    { "id": 2, "tasks": ["5"] },
    { "id": 3, "tasks": ["7"] },
    { "id": 4, "tasks": ["9"] },
    { "id": 5, "tasks": ["10"] }
  ]
}
```