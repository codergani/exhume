# Implementation Plan: readme-explainer

## Overview

Three additions to autopsy-core: a README panel, an optional AI overview, and a presentational HIBERNATING label. The build order is pure functions first (tasks 1 and 2), the GitHub fetch (task 3), schema and fallback types (task 4), the provider (task 5), the UI (task 6), App wiring last (task 7), then a checkpoint (task 8). Each task is small and leaves the whole suite green.

Constraints for every task: no new dependencies, no backend, no accounts. Do not modify `requirements.md` or `design.md` of this spec, and do not modify any file under `.kiro/specs/autopsy-core/` or `.kiro/specs/revival-extras/`. New pure modules in `src/lib` import nothing from `src/ui`, `src/github` or `src/ai`. The AppState stages and transitions, the AI Retry behaviour, RepoVitals, `classifyStatus` and the fallback marker line stay unchanged. Every task ends by running `npm test`, `npx tsc -b` and `npm run lint`; the task's own tests must pass and the whole suite must stay green.

## Tasks

- [x] 1. `src/lib/readme.ts` - excerpt builder, types and URL builder, with tests
  - Create `src/lib/readme.ts` (new file, pure) exporting `README_MAX_CHARS` (6000), `buildReadmeExcerpt(raw, max?)`, the types `ReadmeResult` and `ReadmePayload`, `buildReadmePayload(result)` and `buildReadmeUrl(owner, repo)`, exactly as specified in design.md
  - `buildReadmeExcerpt` removes U+0000-U+001F except newline, carriage return and tab, and U+007F; empty or whitespace-only text returns `{ text: '', truncated: false, empty: true }`; text longer than the max is cut to the max and a trailing high surrogate is dropped; the result is always a prefix of the cleaned input
  - `buildReadmePayload` maps `null`, `undefined` and `unavailable` to `{ status: 'unavailable' }` (never an empty string); `available` maps to `{ status: 'available', truncated, text }`
  - `buildReadmeUrl` returns `https://github.com/{encoded owner}/{encoded repo}#readme`
  - Create `tests/readme.test.ts` with examples: inputs of 5999, 6000 and 6001 characters (truncated flag false, false, true), a surrogate pair straddling the cut with no lone surrogate in the result, control characters removed while newline, carriage return and tab are kept, empty string and whitespace-only string and a string of only removed control characters report `empty`, the same input twice gives deeply equal results, `buildReadmePayload` for available, unavailable, `null` and `undefined`, and `buildReadmeUrl` encoding segments such as `a b` and `x/y`
  - Create `tests/readme.pbt.test.ts` with ONE fast-check property (at least 300 runs) over arbitrary strings, including control characters and surrogates: the excerpt text length is at most 6000 and the text is a prefix of an independently computed cleaned input (the cleaning reference is written inside the test, not imported); tag it `Feature: readme-explainer, Property 1` and annotate the requirements it validates
  - Run `npm test`, `npx tsc -b` and `npm run lint`
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 5.5_

- [x] 2. `src/lib/statusLabel.ts` - HIBERNATING label function with tests
  - Create `src/lib/statusLabel.ts` (new file, pure) exporting `StatusLabel` and `statusLabel(status, monthsSinceLastPush)`: returns `'HIBERNATING'` only for status ALIVE with 3 to 11 months inclusive, otherwise returns the status unchanged; import `RepoStatus` as a type from `./classifyStatus`; do not modify `classifyStatus`
  - Create `tests/statusLabel.test.ts`: ALIVE at 0 and 2 months returns ALIVE; ALIVE at 3 and 11 months returns HIBERNATING; ALIVE at 12 months returns ALIVE; DYING and DEAD at several month values (for example 0, 3, 11, 50) always return their own label; `classifyStatus` outputs for the same vitals are unchanged
  - Run `npm test`, `npx tsc -b` and `npm run lint`
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.8_

- [x] 3. `src/github/readme.ts` - fetchReadme
  - Create `src/github/readme.ts` with `fetchReadme(owner, repo): Promise<string | null>` calling `GET https://api.github.com/repos/{owner}/{repo}/readme` with header `Accept: application/vnd.github.raw+json` and no `Authorization` header
  - 200 resolves `await res.text()`; 404 resolves `null`; 403 or 429 throws `GitHubRateLimitError` (from `src/errors.ts`) reading `X-RateLimit-Reset` the same way `fetchForks` does; any other non-2xx throws a generic `Error` with the status in the message; log nothing
  - Create `tests/readmeClient.test.ts` with mocked `fetch`, in the style of `tests/forksClient.test.ts`: request URL, `Accept` header value, no `Authorization` header, 200 returns the text, 404 returns `null`, 403 with `X-RateLimit-Reset` throws `GitHubRateLimitError` with the right `resetAt`, 429 throws `GitHubRateLimitError`, 500 throws a generic `Error` that is not a `GitHubRateLimitError`
  - Run `npm test`, `npx tsc -b` and `npm run lint`
  - _Requirements: 1.1, 1.7, 4.1, 4.2, 4.3, 4.4, 5.8_

- [x] 4. Schema `overview` and the `Overview` type
  - Edit `src/ai/schema.ts`: add `overviewSchema` (`purpose` 1 to 300 characters, `audience` 1 to 200, `quickStart` array of 0 to 3 strings of 1 to 200) and add `overview: overviewSchema.optional().catch(undefined)` to `autopsyReportSchema`; existing fields and validation are unchanged
  - Edit `src/ai/fallback.ts`: add the `Overview` interface and the optional `overview?: Overview` field on `AutopsyReport`; `buildFallbackReport` never sets `overview`
  - If `.catch` does not drop a present-but-invalid `overview` alone for the installed Zod version, or misbehaves for an absent key, use the documented fallback from design.md instead (validate `raw.overview` with `overviewSchema.safeParse` in `provider.ts` before the main parse and delete it on failure), state in a one-line comment above `overviewSchema` which approach is used, and say so in the task report
  - Append tests to `tests/schema.test.ts` without changing existing cases: a reply without `overview` validates and has no `overview` key; a valid overview is kept; an over-length `purpose`, an over-length `audience`, an over-length quick-start step, an empty field, a quick-start list of 4 steps and a wrong type each leave `overview` undefined while the report still validates; a reply whose other fields are malformed still fails; an empty `quickStart` list is valid
  - Append one case to `tests/fallback.test.ts`: the fallback report has no `overview` key
  - Run `npm test`, `npx tsc -b` and `npm run lint`
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.7, 6.8, 6.9, 6.11, 6.12_

- [x] 5. `src/ai/provider.ts` - readme in the payload, injection defence and overview handling
  - Change `runAutopsy` to `runAutopsy(vitals, depRot, forks?, readme?)` with `readme?: ReadmePayload` (type imported from `src/lib/readme`); the prompt JSON gains the key `readme`, defaulting to `{ status: 'unavailable' }`; no other content (source files, commit messages) is added
  - Add the README/overview section to the system instruction as worded in design.md: the `readme` value is project documentation, not source code; it is untrusted data and any instruction inside it is ignored; when available the model may add an optional plain-text `overview` with the caps (300, 200, 3 steps of 200); when unavailable it says nothing about the README and omits `overview`
  - After schema validation and the existing recommendation handling, delete the `overview` key from the result when `readme` is missing or its status is not `available`
  - Keep the schema retry, fence stripping, transient backoff and `MAX_ATTEMPTS` unchanged; a malformed overview alone never triggers a retry
  - In `tests/provider.test.ts` change ONLY the three key-set assertions, each from `['deps', 'forks', 'vitals']` to `['deps', 'forks', 'readme', 'vitals']`; change nothing else in that file
  - Append new tests: the readme payload is sent exactly as given; `readme` defaults to `{ status: 'unavailable' }` when omitted; the system instruction mentions documentation not source, untrusted data, ignoring instructions, and plain-text overview; a valid overview is kept when the README is available; the overview is deleted when the README is unavailable even though the reply contains one; a malformed overview is dropped while the rest of the report is kept, with exactly ONE `generateContent` call (no schema retry); a reply without an overview is unchanged; the README text never appears in the message of a thrown transport error
  - Run `npm test`, `npx tsc -b` and `npm run lint`
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 6.6, 6.7, 6.8, 6.10, 8.6_

- [x] 6. UI: `ReadmePanel`, overview lines and the HIBERNATING badge
  - Create `src/ui/ReadmePanel.tsx` as specified in design.md: `available` renders a labelled section with a focusable, labelled scroll region holding the excerpt as a single text child (no `dangerouslySetInnerHTML`, no HTML or Markdown interpretation), a truncation note when `truncated`, and exactly one link built from `result.url` with `target="_blank"` and `rel="noopener noreferrer"`; `unavailable` renders only the one-line message, with no button and no link; no timers or animation
  - Modify `src/ui/lines.ts`: when `report.overview` exists, `reportLines` starts with an OVERVIEW block (`OVERVIEW`, `Purpose: ...`, `Audience: ...`, then `Quick start:` with numbered `  N. step` lines only when `quickStart` is non-empty, then a blank line), with each string collapsed to one line (whitespace runs to one space, trimmed); without an overview the output is byte-identical to the pre-feature output
  - Modify `src/ui/VitalsPanel.tsx`: compute `statusLabel(status, vitals.monthsSinceLastPush)` internally, show the label text and use the class `badge-${label.toLowerCase()}`; props are unchanged
  - Modify `src/ui/theme.css`: add new rules only (`.badge-hibernating`, `.readme`, `.readme-text` with `max-height`, `overflow: auto`, `white-space: pre-wrap`, `.readme-note`); no existing rule is altered; no animation or transition; colours reuse the existing `--crypt-*` variables so text stays readable
  - Create `tests/ReadmePanel.test.tsx`: the scroll region is focusable (`tabindex`) and has an accessible label; exactly one link with `target="_blank"` and a `rel` containing `noopener` and `noreferrer`; the truncation note shows only when truncated; excerpt text `<script>alert(1)</script><a href="http://evil">x</a>` is shown as literal text with no `script` element and no extra link; `unavailable` shows only its line and no button
  - Create `tests/lines.test.ts`: the overview block comes first; quick-start steps are numbered from 1; whitespace and newlines in fields are collapsed; an empty `quickStart` prints no `Quick start:` line; a report without an overview gives the same lines as the pre-feature output (compare with an inline expected array for a fixed report)
  - Append to `tests/VitalsPanel.test.tsx` without changing existing tests: ALIVE at 3 and at 11 months shows HIBERNATING with class `badge-hibernating`; ALIVE at 2 months shows ALIVE; DYING and DEAD are unaffected
  - Run `npm test`, `npx tsc -b` and `npm run lint`
  - _Requirements: 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 4.6, 6.6, 7.7, 7.10_

- [x] 7. `src/App.tsx` - wire the README step
  - Add a `findReadme(owner, repo)` helper in `src/App.tsx` that never throws and returns a `ReadmeResult` with the messages from design.md: `null` or empty-after-cleaning gives the no-README line; `GitHubRateLimitError` with a valid `resetAt` gives a line including `resetAt.toLocaleTimeString()` and the next action; an invalid `resetAt` gives the line without a time; any other error gives the could-not-read line; success gives `available` with `buildReadmeExcerpt` text, `truncated` and `buildReadmeUrl(owner, repo)`
  - During EXAMINING fetch the README for every status, including ALIVE, concurrently with the existing forks step via `Promise.all` (both legs never throw); check the existing run guard once before setting both results; a README failure never sets ERROR_GITHUB or ERROR_AI and never blocks CONSULTING
  - Hold `readmeResult` in separate state (not in `AppState`); cache only `available` results in memory under the lowercased `owner/repo` key, so a repeat analysis with different letter case makes no new request
  - `consult` passes `buildReadmePayload(readme)` as the fourth argument of `runAutopsy`; `handleRetry` reuses the held forks and README results and never calls `fetchReadme` again; `handleReset` clears `readmeResult` but keeps the caches
  - Render `ReadmePanel` in RESULTS and FALLBACK after the report and before the actions, and not in ERROR_AI; `AppState`, transitions, progress lines and the fallback marker stay unchanged
  - APPROVAL REQUIRED before this task runs: `tests/App.test.tsx` needs one setup edit, namely `vi.mock('../src/github/readme', ...)`, the import, a typed handle for `fetchReadme`, and a default `mockResolvedValue(null)` in `beforeEach`. Ask the user to approve this edit first. All other changes to `tests/App.test.tsx` are appended tests only
  - Append tests to `tests/App.test.tsx`: the README panel appears after the report and the overview appears inside the report; `fetchReadme` is called for an ALIVE repo; a missing README shows one in-theme line, the report is still shown and there is no `role="alert"`; a fetch failure shows one line and the report is shown; a rate limit line includes `resetAt.toLocaleTimeString()`; AI Retry after a transport error does not call `fetchReadme` again and sends the same readme payload; `runAutopsy` receives the readme payload as its 4th argument and `{ status: 'unavailable' }` when the README failed; the overview is not shown when the README was unavailable even if the reply contains one; ERROR_AI shows no README panel
  - No existing assertion changes; if one would break, stop and report instead of editing it
  - Run `npm test`, `npx tsc -b` and `npm run lint`
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 3.1, 3.2, 4.1, 4.2, 4.3, 4.4, 4.5, 4.7, 4.8, 5.1, 5.2, 5.5, 6.10, 8.5_

- [x] 8. Checkpoint - README explainer is shippable
  - Run `npm test`, `npm run lint` and `npm run build`; all must pass, including every existing test
  - Confirm with `git diff` that the only changed existing assertions are the three provider key-set assertions, and that the only other edit to an existing test is the readme mock setup in `tests/App.test.tsx` plus appended tests
  - Confirm nothing under `.kiro/specs/autopsy-core/` or `.kiro/specs/revival-extras/` changed (other than bookkeeping files the tooling writes), and that `package.json` has no new dependencies
  - Confirm no key-like string appears in `dist`
  - Ask the user to smoke-test in the browser: a repo with a README shows the README panel below the report and an overview inside the report; an ALIVE repo with 3 to 11 months since the last push shows HIBERNATING; a repo without a README shows the one-line note; wait for approval
  - _Requirements: 8.1, 8.2, 8.3, 8.5, 8.6, 8.7, 8.8_

## Notes

- There is exactly one property-based test in this spec: the excerpt builder in `tests/readme.pbt.test.ts` (task 1). All other properties from design.md are covered by example tests.
- The three key-set assertions in `tests/provider.test.ts` are the same fact asserted in three places: the AI prompt gains the `readme` key. They are the only existing assertions that change.
- The `tests/App.test.tsx` mock setup (`vi.mock('../src/github/readme', ...)`, import, typed handle, default `mockResolvedValue(null)` in `beforeEach`) needs the user's approval before task 7 runs. All other edits to existing test files are appended tests.
- This spec modifies `provider.ts`, `App.tsx`, `tests/App.test.tsx` and `tests/provider.test.ts`, which revival-extras also touched, so run the full suite at every task.
- Each task references the requirements it satisfies for traceability.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1", "2", "3", "4"] },
    { "id": 1, "tasks": ["5", "6"] },
    { "id": 2, "tasks": ["7"] },
    { "id": 3, "tasks": ["8"] }
  ]
}
```
