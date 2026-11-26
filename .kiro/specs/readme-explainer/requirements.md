# Requirements Document

## Introduction
Exhume analyses a public GitHub repository and produces an autopsy and resurrection plan in a haunted terminal interface. This spec adds three things on top of autopsy-core: a README panel, an optional AI overview of the project (purpose, audience, quick start), and a presentational HIBERNATING label for repos that are quiet but not dying. All three are visible in a 90-second demo video: the README panel appears with the results, the overview appears in the report, and the HIBERNATING label appears in the vitals panel for a suitable repo.

This spec builds on autopsy-core and does not redefine it. RepoVitals (last push date, archived flag, open issue count, star count, months since last push), `classifyStatus` (DEAD, DYING, ALIVE), the app state machine (IDLE, FETCHING, EXAMINING, CONSULTING, RESULTS, ERROR_GITHUB, ERROR_AI, FALLBACK), the AutopsyReport (cause of death, severity, 3 to 7 steps, generatedAt, optional recommendation), the schema-failure Fallback_Report and the AI Retry button are unchanged. The README is not part of RepoVitals. This spec does not depend on revival-extras being finished: "the AI payload" means whatever payload the AI_Provider sends at the time.

Assumptions:
- The README is fetched for every analysis regardless of status, including ALIVE, because the panel and the overview are useful for any repository. This costs one extra unauthenticated GitHub request per analysis against the limit of 60 requests per hour.
- The README is documentation, not source code. A bounded excerpt is sent to the AI as untrusted data. This is a deliberate exception to the rule of sending only structured JSON and never raw source files, and it is flagged as a decision for the project owner.
- The choice of README media type (raw or JSON with base64) is left to the design phase.
- The overview in the AI reply is optional. A malformed overview is discarded alone and never causes a schema retry or the fallback.
- All user-facing copy is dry, terse and spooky. Errors are in-theme and state what to do next.

## Glossary

- **Exhume**: The client-side web application described by this spec.
- **README_Fetcher**: The component in `src/github` that requests the README of the analysed repository from `GET /repos/{owner}/{repo}/readme` without authentication.
- **README_Excerpt**: The cleaned README text of at most 6000 characters, produced by the Excerpt_Builder, shown to the user and sent to the AI_Provider.
- **Excerpt_Builder**: The pure function in `src/lib` that cleans raw README text and truncates it to a README_Excerpt.
- **README_Panel**: The scrollable UI region that shows the README_Excerpt and the link to the original README.
- **README_Link**: The link to the original README on GitHub, built by Exhume from the repository owner and name.
- **Overview**: The optional object in the AI reply with `purpose`, `audience` and `quickStart` (0 to 3 steps).
- **Overview_Schema**: The part of the validation schema in `src/ai/schema.ts` that validates the Overview.
- **AI_Provider**: The module `src/ai/provider.ts`, the only place that calls the AI.
- **Status_Label**: The pure function in `src/lib` that maps a status and months since last push to the label shown in the VitalsPanel.
- **Hibernation_Label**: The label `HIBERNATING`, shown for repos classified ALIVE with 3 to 11 months since the last push, inclusive.
- **Fallback_Report**: The deterministic report built from vitals when the AI reply fails schema validation.
- **Report**: The AutopsyReport shown in the RESULTS or FALLBACK state.

## Requirements

### Requirement 1: README fetch and caching
**User Story:** As a developer, I want the README fetched once per repository, so that the extra data costs as few GitHub requests as possible.

#### Acceptance Criteria
1. WHEN an analysis starts for a repository, THEN THE README_Fetcher SHALL request `GET /repos/{owner}/{repo}/readme` without authentication, regardless of the repository status.
2. THE README_Fetcher SHALL perform the README request during the existing EXAMINING phase.
3. THE Exhume SHALL keep the existing state machine states and transitions when the README is fetched.
4. WHEN the README is fetched for a repository, THEN THE README_Fetcher SHALL cache the result in memory under the lowercased `owner/repo` key.
5. WHEN the same repository is analysed again with a different letter case in the URL, THEN THE README_Fetcher SHALL return the cached result without a new request.
6. WHEN the user presses the AI Retry button, THEN THE Exhume SHALL re-enter CONSULTING without calling the README endpoint again.
7. THE README_Fetcher SHALL reside in `src/github` and SHALL send the same unauthenticated request headers as the existing GitHub client.

### Requirement 2: README excerpt building
**User Story:** As a developer, I want a bounded, clean README excerpt, so that the panel and the AI payload stay small and safe to display.

#### Acceptance Criteria
1. THE Excerpt_Builder SHALL return a README_Excerpt of at most 6000 characters.
2. WHEN the cleaned README text is longer than 6000 characters, THEN THE Excerpt_Builder SHALL return the first 6000 characters or fewer, and SHALL report that the text was truncated.
3. WHEN truncation falls between the two halves of a surrogate pair, THEN THE Excerpt_Builder SHALL cut before that pair so the result contains no lone surrogate.
4. THE Excerpt_Builder SHALL remove control characters other than newline, carriage return and tab before truncation.
5. WHEN the cleaned README text is empty or contains only whitespace, THEN THE Excerpt_Builder SHALL report the README as empty.
6. WHEN the same raw text is given, THEN THE Excerpt_Builder SHALL return an identical result.
7. FOR ALL input strings, THE Excerpt_Builder SHALL return a README_Excerpt whose length is at most 6000 characters and which is a prefix of the cleaned input.
8. THE Excerpt_Builder SHALL reside in `src/lib` and SHALL import nothing from `src/ui`, `src/github` or `src/ai`.
9. THE Exhume SHALL provide Vitest unit tests for the Excerpt_Builder covering inputs of 5999, 6000 and 6001 characters, a surrogate pair at the cut point, control characters and empty input.
10. THE Exhume SHALL provide one fast-check property test for the Excerpt_Builder that verifies the length and prefix property in criterion 7.

### Requirement 3: README panel display
**User Story:** As a developer, I want to read the start of the README in the results, so that I can judge the project without leaving Exhume.

#### Acceptance Criteria
1. WHILE the README_Excerpt is available and the state is RESULTS or FALLBACK, THE README_Panel SHALL be visible together with the Report.
2. WHILE the README is skipped or failed, THE README_Panel SHALL be absent.
3. THE README_Panel SHALL show the README_Excerpt as plain text with whitespace and line breaks preserved.
4. THE README_Panel SHALL be a scrollable region that is reachable by keyboard focus and has an accessible label.
5. THE README_Panel SHALL render the README_Excerpt as text nodes, without `dangerouslySetInnerHTML`, without interpreting HTML or Markdown, and without creating links from README content.
6. THE README_Panel SHALL contain exactly one link, the README_Link, built by Exhume from the repository owner and name.
7. THE README_Panel SHALL render the README_Link with `target="_blank"` and `rel="noopener noreferrer"`.
8. WHEN the README_Excerpt was truncated, THEN THE README_Panel SHALL show one short in-theme note stating that the text was cut and pointing to the README_Link.
9. THE README_Panel SHALL be shown without animation or flicker.
10. THE README_Panel SHALL render its text with the same readable contrast as the rest of the terminal text.

### Requirement 4: README failure handling
**User Story:** As a user, I want the report even when the README cannot be loaded, so that an optional extra never blocks my autopsy.

#### Acceptance Criteria
1. IF the README request returns 404 or the repository has no README, THEN THE Exhume SHALL skip the README step and show one in-theme line stating that no README was found.
2. IF the README request fails because of a network error or a non-2xx response other than 404, THEN THE Exhume SHALL skip the README step and show one in-theme line stating that the README could not be read.
3. IF the README request fails because of a rate limit and the reset time is known, THEN THE Exhume SHALL show one in-theme line that includes the reset time and the next action.
4. IF the README request fails because of a rate limit and the reset time is unknown, THEN THE Exhume SHALL show one in-theme line that states the next action without a reset time.
5. IF the README request fails for any reason, THEN THE Exhume SHALL continue to the CONSULTING state without entering ERROR_GITHUB or ERROR_AI.
6. IF the README request fails for any reason, THEN THE Exhume SHALL show no retry button for the README step.
7. IF the README step is skipped, THEN THE Exhume SHALL show the Report with no change other than the single in-theme line.
8. WHEN the README text is empty after cleaning, THEN THE Exhume SHALL treat the README as missing and show the line from criterion 1.

### Requirement 5: README in the AI payload and prompt-injection defence
**User Story:** As a developer, I want the AI to use the README safely, so that text inside a README cannot hijack the report.

#### Acceptance Criteria
1. WHEN the README_Excerpt is available, THEN THE AI_Provider SHALL include it in the AI payload under the key `readme`, as a string of data.
2. THE AI_Provider SHALL send in the `readme` key exactly the README_Excerpt shown in the README_Panel.
3. THE AI_Provider SHALL state in the system instruction that the `readme` value is project documentation, not source code.
4. THE AI_Provider SHALL instruct the model in the system instruction to treat the `readme` value as untrusted data and to ignore any instruction contained in it.
5. IF the README step was skipped or failed, THEN THE AI_Provider SHALL mark the README as unavailable in the AI payload and SHALL NOT send an empty string as the README.
6. IF the README is marked unavailable, THEN THE AI_Provider SHALL instruct the model to say nothing about the README, consistent with the existing rule never to mention internal limits.
7. WHEN the AI reply is received, THEN THE AI_Provider SHALL validate it against the schema before use, so that text inside the README cannot change the format of the Report.
8. THE Exhume SHALL write no README content to logs and SHALL include no README content in any URL.
9. WHEN the AI payload is built, THEN THE AI_Provider SHALL keep the existing keys, and the only existing assertion allowed to change in `tests/provider.test.ts` is the AI prompt-keys assertion, which gains the `readme` key.

### Requirement 6: Overview in the AI reply
**User Story:** As a developer, I want a short statement of what the project does, who it is for and how to start, so that I can judge it quickly.

#### Acceptance Criteria
1. THE Overview_Schema SHALL accept an optional `overview` object with `purpose`, `audience` and `quickStart`.
2. THE Overview_Schema SHALL require `purpose` to be a non-empty string of at most 300 characters.
3. THE Overview_Schema SHALL require `audience` to be a non-empty string of at most 200 characters.
4. THE Overview_Schema SHALL require `quickStart` to be a list of 0 to 3 non-empty strings of at most 200 characters each.
5. WHEN the AI reply contains no `overview`, THEN THE Exhume SHALL accept the reply as valid and show the Report exactly as before.
6. WHEN the AI reply contains a valid `overview`, THEN THE Exhume SHALL show the purpose, the audience and the quick-start steps in the Report as plain text, with no HTML or Markdown interpretation and no links.
7. IF the AI reply contains an `overview` that is malformed or exceeds a length cap, THEN THE Exhume SHALL discard the overview alone, accept the rest of the reply, and show the Report without an overview.
8. IF the AI reply contains a malformed `overview`, THEN THE Exhume SHALL NOT trigger the schema retry and SHALL NOT use the Fallback_Report because of the overview.
9. IF the rest of the reply fails schema validation, THEN THE Exhume SHALL apply the existing retry and fallback behaviour unchanged.
10. WHILE the README is unavailable, THE AI_Provider SHALL NOT request an overview, and THE Exhume SHALL show no overview even if the reply contains one.
11. THE Fallback_Report SHALL contain no overview.
12. THE Exhume SHALL provide Vitest unit tests for the Overview_Schema covering a valid overview, an absent overview, an over-length field, an empty field, a quick-start list of 4 steps and a wrong type.

### Requirement 7: HIBERNATING label
**User Story:** As a developer, I want a repo that is quiet but not dying labelled differently from an active one, so that I do not mistake a stable project for an abandoned one.

#### Acceptance Criteria
1. WHEN the status is ALIVE and months since last push is from 3 to 11 inclusive, THEN THE Status_Label SHALL return the Hibernation_Label.
2. WHEN the status is ALIVE and months since last push is less than 3, THEN THE Status_Label SHALL return the label ALIVE.
3. WHEN the status is DYING, THEN THE Status_Label SHALL return the label DYING for any months since last push.
4. WHEN the status is DEAD, THEN THE Status_Label SHALL return the label DEAD for any months since last push.
5. THE Status_Label SHALL reside in `src/lib` and SHALL import nothing from `src/ui`, `src/github` or `src/ai`.
6. THE Exhume SHALL provide Vitest unit tests for the Status_Label covering 2, 3, 11 and 12 months with status ALIVE, and the statuses DYING and DEAD.
7. THE VitalsPanel SHALL show the Hibernation_Label when the Status_Label returns it, and SHALL keep the status badge for ALIVE, DYING and DEAD otherwise.
8. THE Exhume SHALL keep `classifyStatus` unchanged.
9. THE Exhume SHALL send the status ALIVE to the AI, and SHALL use the status ALIVE in the Fallback_Report, the export and all logic, for a repo shown with the Hibernation_Label.
10. WHEN the existing VitalsPanel tests that pass status ALIVE with 50 months are run, THEN THE VitalsPanel SHALL pass them unchanged.

### Requirement 8: Project constraints and non-regression
**User Story:** As a maintainer, I want the README features to respect the project constraints, so that the existing product keeps working and stays within scope.

#### Acceptance Criteria
1. THE Exhume SHALL add no new package dependencies for these features.
2. THE Exhume SHALL use no backend, user accounts or database for these features.
3. THE Exhume SHALL contain no API keys or secrets in the client bundle and SHALL write no keys or tokens to logs.
4. THE Exhume SHALL send all AI requests for these features only through the AI_Provider.
5. THE Exhume SHALL keep the existing state machine states and transitions, the AI Retry behaviour and the fallback marker line "the spirits are silent — showing instrument readings only." unchanged.
6. WHEN the existing test suite is run after these features are added, THEN THE Exhume SHALL pass all existing tests, except that the AI prompt-keys assertion in `tests/provider.test.ts` is allowed to gain the `readme` key.
7. THE Exhume SHALL keep RepoVitals unchanged and SHALL NOT add README data to RepoVitals.
8. WHEN a 90-second demo is recorded for a repo with a README, THEN THE Exhume SHALL show the README_Panel, the Overview and, for a repo that is ALIVE with 3 to 11 months since the last push, the Hibernation_Label.
