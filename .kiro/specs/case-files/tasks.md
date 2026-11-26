# Implementation Plan: case-files

## Overview

Saved case files in two phases. This plan is phase 1: the pure loader (task 1), one fictional placeholder case with its bundling index (task 2), the UI components (task 3), the App wiring (task 4) and a checkpoint (task 5). Each task leaves the whole suite green.

Constraints for every task: no new dependencies, no backend, no accounts, no property-based tests. Do not modify `requirements.md` or `design.md` of this spec, and do not modify any file under `.kiro/specs/autopsy-core/`, `revival-extras/`, `readme-explainer/` or `readme-cleanup/`. `src/lib/caseFile.ts` imports nothing from `src/ui`, `src/github` or `src/ai`. The AppState stages and transitions, the AI Retry behaviour and the fallback marker line stay unchanged. Existing tests are not edited; `tests/App.test.tsx` only gets appended tests. Every task ends by running `npm test`, `npx tsc -b` and `npm run lint`.

## Tasks

- [x] 1. `src/lib/caseFile.ts` - pure loader with tests
  - Create `src/lib/caseFile.ts` exporting `CaseVitals`, `CaseReport`, `CaseSource`, `CaseFile`, `CaseLoadResult`, `ReportValidator` and `loadCaseFile(input, validateReport)` exactly as specified in design.md; reuse `ForkResult` from `./forks` and `README_MAX_CHARS` from `./readme`; no Zod import
  - `loadCaseFile` never throws (try/catch returning `{ ok: false, reason: 'unreadable case file' }`), performs no I/O and reads no clock, applies the validation rules in the design order, validates the report with the injected validator and checks `generatedAt` separately, and returns a NEW object (new arrays for `living`, `steps`, `quickStart`)
  - Reason strings are short and never include field values
  - Create `tests/caseFile.test.ts` with the example cases listed in the design Testing Strategy, using the real `autopsyReportSchema` as the injected validator
  - Run `npm test`, `npx tsc -b` and `npm run lint`
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11, 2.12, 2.13, 2.14, 2.15_

- [x] 2. Placeholder case data, bundling index and shipped-case test
  - Create `src/cases/placeholder-lantern.json` with the exact values in design.md (fictional `lanternworks/lantern`, ALIVE at 7 months, `forks: { "status": "skipped" }`, severity `stable`, 3 steps each citing a concrete value, overview, README excerpt written for the sample, `license` `Apache-2.0`, `source` `{ kind: fictional, readmeOrigin: written-for-sample }`); use the step field names from the existing report type in `src/ai/fallback.ts`
  - Create `src/cases/index.ts` using `import.meta.glob('./*.json', { eager: true, import: 'default' })`, passing each value and `autopsyReportSchema` to `loadCaseFile`; export `savedCases` (valid cases sorted by `id`) and `rejectedCaseCount`; no logging
  - Create `tests/cases.test.ts` with the checks listed in the design (`rejectedCaseCount` is 0; `savedCases.length` between 1 and 3; unique ids; no `/exhume/i` in owner, repo or built accessible-name text; no secret patterns or email addresses in any string; license, source and capturedAt present; README length at most 6000)
  - Run `npm test`, `npx tsc -b` and `npm run lint`
  - _Requirements: 1.2, 1.3, 1.4, 1.5, 1.6, 1.8, 1.9, 1.10, 1.11, 2.16, 7.3_

- [x] 3. UI components: `CaseFileList`, `SampleLabel` and theme rules
  - Create `src/ui/CaseFileList.tsx` as specified in design.md: renders nothing for an empty list; otherwise a labelled section with the heading "Saved case files" and a `<ul>` with one native `<button type="button">` per case, text `owner/repo · statusLabel · captured YYYY-MM-DD`, using `classifyStatus` and `statusLabel` from `src/lib`; no "exhume" in any button name; text nodes only
  - Create `src/ui/SampleLabel.tsx`: one `<p className="sample-label" role="note">` with `saved sample · frozen snapshot from YYYY-MM-DD, not live data` plus ` · fictional repository` for `fictional`; no animation
  - Append rules for `.cases`, `.cases ul`, `.cases li`, `.cases button` and `.sample-label` to `src/ui/theme.css`; alter no existing rule; no transition or animation; readable contrast with the `--crypt-*` variables
  - Add an optional `savedExcerpt?: boolean` prop to `src/ui/ReadmePanel.tsx` (default `false`, current behaviour unchanged): when true, render `<p className="readme-note">saved excerpt</p>` instead of the link and the truncation note `[cut at 6000 characters.]`; append tests to `tests/ReadmePanel.test.tsx` (no link and the "saved excerpt" text when true; the existing tests stay unchanged)
  - Create `tests/CaseFileList.test.tsx` and `tests/SampleLabel.test.tsx` with the cases listed in the design
  - Run `npm test`, `npx tsc -b` and `npm run lint`
  - _Requirements: 3.3, 3.4, 3.5, 3.6, 3.8, 5.1, 5.2, 5.3, 6.1, 6.5, 7.7_

- [x] 4. `src/App.tsx` wiring and appended App tests
  - Add the `sample` state, `handleOpenCase` and the renders exactly as specified in design.md: `CaseFileList` only in IDLE after the form and input error; `SampleLabel` directly above `VitalsPanel` when `sample` is non-null; `handleSubmit` and `handleReset` clear `sample`
  - `handleOpenCase` increments `runRef`, clears the input error and `restingToday`, sets forks, README result (with `url: ''`, never rendered), sample and RESULTS state with `SKIPPED_DEP_ROT`; it never calls `fetchRepoVitals`, `fetchForks`, `fetchReadme`, `runAutopsy` or Firebase and never touches `vitalsCache`, `forksCache` or `readmeCache`
  - Append tests to `tests/App.test.tsx` (existing tests and assertions unchanged): list visible in IDLE; submit button still found by `/exhume/i` and no other button matches; opening the sample shows the label, the HIBERNATING badge, the report text, the overview, the README panel and "Analyse another" with the four mocks and a spied global `fetch` not called; "Analyse another" clears the label and returns to the form; a later real analysis calls `fetchRepoVitals` and shows no label; no `role="alert"` after opening a sample
  - Render `ReadmePanel` with `savedExcerpt={sample !== null}`; add an App test that the sample README panel shows "saved excerpt" and contains no link to github.com
  - If an existing assertion would break, stop and report instead of editing it
  - Run `npm test`, `npx tsc -b` and `npm run lint`
  - _Requirements: 3.1, 3.2, 3.6, 3.7, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10, 4.11, 4.12, 5.1, 5.4, 5.5, 5.6, 6.2, 6.3, 6.4, 7.5, 7.6, 7.8_

- [x] 5. Checkpoint - saved case files phase 1 is shippable
  - Run `npm test`, `npm run lint` and `npm run build`; all must pass
  - Confirm with `git diff` that the changes are new files plus `src/App.tsx`, `src/ui/theme.css` and appended tests in `tests/App.test.tsx`, with no existing assertion changed; nothing under the other specs changed; `package.json` has no new dependencies; `dangerouslySetInnerHTML` does not appear in `src`
  - Confirm the built bundle in `dist` contains the placeholder text (proves it is bundled), and that opening the sample with the network disabled shows no request in the network tab
  - Ask the user to smoke-test the list, the sample (README panel shows "saved excerpt" and no GitHub link), the label and "Analyse another"; wait for approval
  - State that this checkpoint cannot claim Requirements 1.1 and 1.7 (phase 2), and that 1.8 is complete as a set only in phase 2
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.8_

## Notes

- Phased delivery: phase 1 (this plan) ships one fictional placeholder and all machinery. Phase 2, created when the user pastes the real report text, adds the real DEAD case with a living fork and an overview as one JSON file in `src/cases/`, with no code change once the loader accepts it. Phase 2 closes Requirements 1.1 and 1.7. The loader and the list work for any count from 1 to 3.
- There are no property-based tests in this spec. All checks are example tests.
- Accessible-name rule: existing App tests use `getByRole('button', { name: /exhume/i })` to find the submit button. A case button whose name contains "exhume" would make that query match twice and fail. Case buttons use only `owner/repo`, status and date.
- Decision: a saved sample's README panel shows the text "saved excerpt" instead of a GitHub link (`ReadmePanel` optional `savedExcerpt` prop, default off). Live analyses are unchanged.
- Open question: the user's own repository `codergani/exhume` would violate the accessible-name rule. The own-repository case needs another repository, or the user must accept a different accessible-name format.
- Adding a real case later means dropping one JSON file in `src/cases/` after the loader accepts it.
- Each task references the requirements it satisfies for traceability.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1"] },
    { "id": 1, "tasks": ["2", "3"] },
    { "id": 2, "tasks": ["4"] },
    { "id": 3, "tasks": ["5"] }
  ]
}
```
