# Requirements Document

## Introduction
Exhume analyses a public GitHub repository and produces an autopsy and resurrection plan in a haunted terminal interface. This spec adds saved case files: 2 to 3 sample reports shipped as static JSON in the repository. A "Saved case files" list on the start screen opens one sample with no network request of any kind, and the sample is shown through the existing panels with a clear "saved sample" label. The feature exists so that the 90-second demo works instantly, with no network, no GitHub rate limit and no AI quota.

This spec builds on autopsy-core, revival-extras and readme-explainer and does not redefine them. RepoVitals (last push date, archived flag, open issue count, star count, months since last push), `classifyStatus` (DEAD, DYING, ALIVE), `statusLabel` (presentational HIBERNATING label), the app state machine (IDLE, FETCHING, EXAMINING, CONSULTING, RESULTS, ERROR_GITHUB, ERROR_AI, FALLBACK), the AutopsyReport (cause of death, severity, 3 to 7 steps, generatedAt, optional recommendation, optional overview), the `autopsyReportSchema` in `src/ai/schema.ts`, the ForkResult and ReadmeResult types, the existing panels (VitalsPanel, ForksPanel, report TerminalOutput, ReadmePanel) and the in-memory caches are unchanged.

Assumptions:
- Loading a case file is an additive entry from IDLE into the existing RESULTS stage. No stage and no transition is removed or changed.
- The `autopsyReportSchema` does not validate `generatedAt`, so the loader validates `generatedAt` separately as an ISO string.
- The mechanism that bundles the JSON, and the way the loader obtains `autopsyReportSchema` without importing from `src/ai`, are left to the design phase (see Open questions).
- Property-based tests are not required for this feature. The loader validates a closed set of fields, and example-based tests cover each field and each invalid kind.
- All user-facing copy is dry, terse and spooky. Errors are in-theme and state what to do next.

Open questions for the design phase and the project owner:
- Which repositories are used for the samples. Real captured analyses of real repositories carry the risk of claims about third parties, so fictional repositories are an alternative.
- The README excerpt of each sample must be written for the sample or come from a repository whose license permits redistribution, because the project is Apache-2.0. The `source` field records which.
- How the loader in `src/lib` can validate the report with `autopsyReportSchema` in `src/ai/schema.ts` while importing nothing from `src/ai` (for example schema injection by the caller, or moving the schema). The observable behaviour in Requirement 2 holds for any choice.
- The exact set of samples, within the constraints of Requirement 1.

## Glossary

- **Exhume**: The client-side web application described by this spec.
- **Case_File**: One static JSON document holding a frozen analysis of one repository.
- **Case_File_Loader**: The pure function in `src/lib` that validates unknown JSON and returns a Load_Result.
- **Load_Result**: A discriminated result that is either valid, with typed Case_File data, or invalid, with a reason string.
- **Case_File_List**: The list titled "Saved case files" on the start screen.
- **Saved_Sample_Label**: The plain-text label that marks a displayed Case_File as a frozen snapshot.
- **Report_Schema**: The existing `autopsyReportSchema` in `src/ai/schema.ts`.
- **README_Excerpt**: The bounded plain-text README text of at most 6000 characters, as defined in readme-explainer.
- **README_Link**: The link to the original README, built by Exhume with `buildReadmeUrl(owner, repo)`.
- **Panels**: The existing VitalsPanel, ForksPanel, report TerminalOutput and ReadmePanel.
- **Network_Request**: Any outgoing request of any kind, including fetch, XMLHttpRequest, beacons, dynamic imports from a remote origin and Firebase initialisation.
- **Report**: The AutopsyReport shown in the RESULTS stage.

## Requirements

### Requirement 1: Case file content and shipping
**User Story:** As a developer preparing a demo, I want a few saved reports committed in the repository, so that I can show Exhume working without any live data.

#### Acceptance Criteria
1. THE Exhume SHALL ship at least 2 and at most 3 Case_Files as static JSON files committed in the repository.
2. THE Case_File SHALL contain `owner`, `repo`, `capturedAt` as an ISO date, `source` and the data groups in criteria 3 to 6.
3. THE Case_File SHALL contain `vitals` with the RepoVitals fields, with `monthsSinceLastPush` stored as captured and not recomputed from the current date.
4. THE Case_File SHALL contain `forks` as a ForkResult of status `available` or `skipped`, where each fork entry contains `owner`, `name`, `htmlUrl`, `starCount`, `lastPushDate` and `archived`.
5. THE Case_File SHALL contain README summary fields: a README_Excerpt of at most 6000 characters and a `truncated` flag, and SHALL NOT store the README link.
6. THE Case_File SHALL contain the final report with `causeOfDeath`, `severity`, `steps`, `generatedAt`, and the optional `recommendation` and `overview`.
7. THE shipped Case_Files SHALL include at least one repository classified DEAD that has at least one living fork and an overview.
8. THE shipped Case_Files SHALL include at least one repository classified DYING or ALIVE.
9. WHERE a shipped Case_File is ALIVE with 3 to 11 months since the last push, THE Exhume SHALL show the HIBERNATING label for that sample, and the exact set of samples is a decision for the design and tasks phases.
10. THE Case_File SHALL describe either a real captured analysis or a clearly fictional repository, and SHALL contain no invented claims about a real third-party repository.
11. THE `source` field SHALL state whether the README_Excerpt was written for the sample or taken from a repository whose license permits redistribution, and SHALL name that repository and license in the second case.

### Requirement 2: Pure case file loader
**User Story:** As a maintainer, I want every case file validated by a pure function, so that a corrupt or hostile JSON file can never crash the app or inject content.

#### Acceptance Criteria
1. THE Case_File_Loader SHALL reside in `src/lib` and SHALL perform no I/O, no network request and no clock read.
2. THE Case_File_Loader SHALL import nothing from `src/ui`, `src/github` or `src/ai`.
3. WHEN unknown JSON is given, THEN THE Case_File_Loader SHALL return a Load_Result that is either valid with typed Case_File data, or invalid with a reason.
4. IF the input is not an object, THEN THE Case_File_Loader SHALL return an invalid Load_Result and SHALL NOT throw.
5. IF any field has the wrong type or is missing, THEN THE Case_File_Loader SHALL return an invalid Load_Result and SHALL NOT throw.
6. IF `owner` or `repo` is an empty string, THEN THE Case_File_Loader SHALL return an invalid Load_Result.
7. IF `capturedAt`, `lastPushDate`, a fork `lastPushDate` or `generatedAt` is not a valid ISO date string, THEN THE Case_File_Loader SHALL return an invalid Load_Result.
8. IF `monthsSinceLastPush`, `openIssueCount` or any `starCount` is not a non-negative integer, THEN THE Case_File_Loader SHALL return an invalid Load_Result.
9. IF a fork `htmlUrl` does not start with `https://github.com/`, THEN THE Case_File_Loader SHALL return an invalid Load_Result, so that no `javascript:` or other scheme link is accepted.
10. IF the README_Excerpt is longer than 6000 characters or contains a control character other than newline, carriage return and tab, THEN THE Case_File_Loader SHALL return an invalid Load_Result.
11. THE Case_File_Loader SHALL validate the report of every Case_File with the existing Report_Schema, and no second copy of the report schema SHALL exist in the repository.
12. IF the report has fewer than 3 or more than 7 steps, THEN THE Case_File_Loader SHALL return an invalid Load_Result.
13. IF the report contains a malformed `overview`, THEN THE Case_File_Loader SHALL keep the existing Report_Schema behaviour and drop the overview alone.
14. WHEN the same input is given, THEN THE Case_File_Loader SHALL return an identical Load_Result.
15. THE Exhume SHALL provide Vitest unit tests for the Case_File_Loader covering a valid case, each kind of invalid field in criteria 5 to 10, a report with 2 steps, a malformed overview, a non-object input and determinism.
16. THE Exhume SHALL provide a Vitest test that loads every shipped Case_File and asserts that each returns a valid Load_Result.

### Requirement 3: Saved case files list on the start screen
**User Story:** As a user, I want a list of saved cases on the start screen, so that I can open a sample with one action.

#### Acceptance Criteria
1. WHILE the state is IDLE, THE Exhume SHALL show the Case_File_List under the URL form.
2. WHILE the state is not IDLE, THE Exhume SHALL NOT show the Case_File_List.
3. THE Case_File_List SHALL have the title "Saved case files".
4. THE Case_File_List SHALL contain one entry for each shipped Case_File that returns a valid Load_Result, showing `owner/repo`, the status label and the captured date.
5. THE Case_File_List SHALL be a list element, and each entry SHALL be a button with an accessible name that contains `owner/repo`.
6. WHEN the user activates an entry with the mouse, the Enter key or the Space key, THEN THE Exhume SHALL load that Case_File.
7. IF a shipped Case_File returns an invalid Load_Result, THEN THE Exhume SHALL omit that entry and SHALL continue to run without error.
8. IF no shipped Case_File returns a valid Load_Result, THEN THE Exhume SHALL hide the Case_File_List including its title.

### Requirement 4: Loading a case file
**User Story:** As a presenter, I want a saved case to open instantly offline, so that the demo never depends on network, rate limit or AI quota.

#### Acceptance Criteria
1. WHEN the user activates a Case_File_List entry, THEN THE Exhume SHALL show the Case_File through the Panels with no Network_Request.
2. WHEN a Case_File is loaded, THEN THE Exhume SHALL enter the RESULTS stage directly from IDLE, with no FETCHING, EXAMINING or CONSULTING stage shown.
3. THE Exhume SHALL treat loading a Case_File as an additive entry from IDLE into RESULTS, and SHALL keep every existing stage and transition unchanged.
4. WHEN a Case_File is loaded, THEN THE Exhume SHALL never enter ERROR_GITHUB, ERROR_AI or FALLBACK.
5. WHEN a Case_File is loaded, THEN THE VitalsPanel SHALL show the vitals of the Case_File with the status from `classifyStatus` applied to the stored vitals.
6. WHEN a Case_File is loaded, THEN THE ForksPanel SHALL show the stored forks, with each link built from the validated `htmlUrl`.
7. WHEN a Case_File is loaded, THEN THE report TerminalOutput SHALL show the stored Report with the typewriter effect, and SHALL show the overview first when the Report contains one.
8. WHEN a Case_File is loaded, THEN THE ReadmePanel SHALL show the stored README_Excerpt with the README_Link built by `buildReadmeUrl(owner, repo)`.
9. WHEN a Case_File is loaded, THEN THE Exhume SHALL NOT call `runAutopsy`, the GitHub client or the AI_Provider.
10. WHEN a Case_File is loaded, THEN THE Exhume SHALL NOT read from or write to the in-memory vitals cache, forks cache or README cache.
11. WHEN a real analysis of the same repository follows a loaded Case_File, THEN THE Exhume SHALL fetch live data and SHALL NOT serve the frozen data.
12. WHEN the user presses "Analyse another" while a Case_File is shown, THEN THE Exhume SHALL return to IDLE and clear the Case_File from the display.

### Requirement 5: Saved sample labelling
**User Story:** As a viewer, I want a saved case clearly marked as a frozen snapshot, so that I never mistake it for live data.

#### Acceptance Criteria
1. WHILE a Case_File is shown, THE Exhume SHALL show the Saved_Sample_Label with the text "saved sample" and the captured date above the VitalsPanel.
2. WHILE a Case_File is shown, THE Saved_Sample_Label SHALL state in one dry, terse, in-theme sentence that the data is a frozen snapshot and not live.
3. THE Saved_Sample_Label SHALL be plain text with no animation and with the same readable contrast as the rest of the terminal text.
4. WHILE a Case_File is shown, THE Saved_Sample_Label SHALL remain visible for the whole time the Case_File is shown, including while the report types out.
5. WHEN a real analysis is shown, THEN THE Exhume SHALL NOT show the Saved_Sample_Label.
6. THE Exhume SHALL present no part of a shown Case_File as live data.

### Requirement 6: Safety and accessibility
**User Story:** As a user, I want saved content rendered safely and accessibly, so that a case file cannot execute anything or exclude anyone.

#### Acceptance Criteria
1. THE Exhume SHALL render all Case_File text as text nodes, without `dangerouslySetInnerHTML` and without interpreting HTML or Markdown.
2. THE Exhume SHALL create links from a Case_File only for the validated fork URLs and for the README_Link.
3. THE Exhume SHALL render each such link with `target="_blank"` and `rel="noopener noreferrer"`.
4. WHILE the user prefers reduced motion, THE Exhume SHALL show a loaded Case_File without the typewriter animation.
5. THE Case_File_List SHALL be reachable and operable by keyboard alone.

### Requirement 7: Project constraints and non-regression
**User Story:** As a maintainer, I want case files to respect the project constraints, so that the existing product keeps working and stays within scope.

#### Acceptance Criteria
1. THE Exhume SHALL add no new package dependencies for this feature.
2. THE Exhume SHALL use no backend, user accounts or database for this feature.
3. THE Case_Files SHALL contain no API keys, tokens, email addresses or personal data.
4. THE Exhume SHALL write no keys or tokens to logs, and SHALL leave `.env` untouched.
5. THE Exhume SHALL keep the existing state machine stages and transitions, the AI Retry behaviour and the fallback marker line "the spirits are silent — showing instrument readings only." unchanged.
6. WHEN the existing test suite is run after this feature is added, THEN THE Exhume SHALL pass all existing tests unchanged, and the only anticipated additions SHALL be new tests and new files.
7. THE Case_File_List entries SHALL NOT match the accessible-name query `getByRole('button', { name: /exhume/i })` used by existing App tests, so that the submit button remains the only match.
8. WHEN a 90-second demo is recorded with the network disabled, THEN THE Exhume SHALL open a saved sample and show the vitals, the forks, the report and the README panel.
