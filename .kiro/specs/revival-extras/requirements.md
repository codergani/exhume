# Requirements Document

## Introduction
Exhume analyses a public GitHub repository and produces an autopsy and resurrection plan in a haunted terminal interface. This spec adds two extras on top of autopsy-core: a living-fork finder and an export of the plan as a Kiro spec. Both features are visible in a 90-second demo video: the fork list appears before the plan for a DEAD or DYING repo, and one button per file downloads `requirements.md` and `tasks.md`.

This spec builds on autopsy-core and does not redefine it. RepoVitals (last push date, archived flag, open issue count, star count, months since last push), `classifyStatus` (DEAD, DYING, ALIVE), the app state machine (IDLE, FETCHING, EXAMINING, CONSULTING, RESULTS, ERROR_GITHUB, ERROR_AI, FALLBACK), the AutopsyReport (cause of death, severity, 3 to 7 steps, generatedAt), the schema-failure fallback report and the AI Retry button are unchanged. Forks are not part of RepoVitals.

Assumptions:
- Forks are fetched only when the original repository is classified DEAD or DYING, to conserve the unauthenticated GitHub rate limit of 60 requests per hour.
- The fork recommendation in the AI reply is optional, so replies without it remain valid.
- The export offers two separate buttons, one per file. Each button downloads exactly one file, and the app never triggers two downloads at once.
- All user-facing copy is dry, terse and spooky. Errors are in-theme and state what to do next.

## Glossary

- **Exhume**: The client-side web application described by this spec.
- **Fork_Finder**: The component that fetches and presents forks of the analysed repository.
- **Fork_Selector**: The pure function in `src/lib` that filters, ranks and truncates forks.
- **Living_Fork**: A fork that is not archived, has fewer than 12 months since its last push, and whose last push is later than the last push of the original repository.
- **Fork_Summary**: The small structured JSON object describing forks that is included in the AI payload.
- **Fork_Recommendation**: The optional part of the plan stating whether to adopt a named Living_Fork or revive the original repository.
- **AI_Provider**: The module `src/ai/provider.ts`, the only place that calls the AI.
- **Fallback_Report**: The deterministic report built from vitals when the AI reply fails schema validation.
- **Report**: The AutopsyReport shown in the RESULTS or FALLBACK state.
- **Spec_Exporter**: The pure functions in `src/lib` that generate the contents of `requirements.md` and `tasks.md` from a Report.
- **Export_Requirements_Button**: The button that downloads `requirements.md`.
- **Export_Tasks_Button**: The button that downloads `tasks.md`.

## Requirements

### Requirement 1: Living-fork discovery and selection
**User Story:** As a developer, I want to see which forks of a dead repo are still alive, so that I can adopt a maintained fork instead of reviving the original.

#### Acceptance Criteria
1. WHEN vitals are fetched and the original repository is classified DEAD or DYING, THEN THE Fork_Finder SHALL request `GET /repos/{owner}/{repo}/forks` with `sort=stargazers` and `per_page=30`.
2. WHEN the original repository is classified ALIVE, THEN THE Fork_Finder SHALL make no forks request and SHALL show nothing about forks.
3. THE Fork_Selector SHALL treat a fork as a Living_Fork only when the fork is not archived, has fewer than 12 months since its last push, and has a last push later than the last push of the original repository.
4. THE Fork_Selector SHALL return at most 3 Living_Forks, ordered by star count descending.
5. WHEN two Living_Forks have equal star counts, THEN THE Fork_Selector SHALL order the one with the more recent last push first, and WHEN the last pushes are also equal, THEN THE Fork_Selector SHALL order them alphabetically by owner name.
6. WHEN the same input list, the same original last push date and the same reference date are given, THEN THE Fork_Selector SHALL return an identical result.
7. THE Fork_Selector SHALL reside in `src/lib` and SHALL import nothing from `src/ui`, `src/github` or `src/ai`.

### Requirement 2: Fork display before the plan
**User Story:** As a developer, I want the living forks shown before the plan, so that I see the alternatives before I read the revival steps.

#### Acceptance Criteria
1. WHEN at least one Living_Fork exists, THEN THE Exhume SHALL show up to 3 Living_Forks before the plan, each with a link to the fork, its star count and its last push date.
2. THE Exhume SHALL render each fork link with `rel="noopener noreferrer"`.
3. WHEN zero Living_Forks exist among the inspected forks, THEN THE Exhume SHALL show one in-theme line stating that no living forks were found, and SHALL still show the report.
4. WHILE the user prefers reduced motion, THE Exhume SHALL show the fork list without animation or flicker.
5. THE Exhume SHALL render fork text with the same readable contrast as the rest of the terminal text.

### Requirement 3: Fork data in the AI payload and plan recommendation
**User Story:** As a developer, I want the plan to say whether to adopt a living fork or revive the original, so that I choose the cheapest path to a working project.

#### Acceptance Criteria
1. WHEN forks were fetched successfully, THEN THE AI_Provider SHALL include a Fork_Summary in the payload containing the number of Living_Forks found among the forks inspected and, for each of the top Living_Forks, the owner, name, star count and months since last push.
2. IF the fork step was skipped or failed, THEN THE AI_Provider SHALL include a Fork_Summary marked as unavailable and SHALL NOT report a count of zero.
3. THE AI_Provider SHALL exclude source code, file contents and commit messages from the Fork_Summary.
4. WHEN a Living_Fork exists, THEN THE Report SHALL be able to state whether to adopt a named Living_Fork or revive the original repository.
5. WHEN the AI reply contains no Fork_Recommendation, THEN THE Exhume SHALL accept the reply as valid and show the report as before.
6. WHEN a Fallback_Report is built and a top Living_Fork exists, THEN THE Fallback_Report SHALL mention that Living_Fork by owner and name.
7. WHEN a Fallback_Report is built and no Living_Fork exists or forks were unavailable, THEN THE Fallback_Report SHALL be identical to the Fallback_Report produced before this feature.

### Requirement 4: Fork failure resilience
**User Story:** As a user, I want the report even if forks cannot be loaded, so that an optional extra never blocks my autopsy.

#### Acceptance Criteria
1. IF the forks request fails because of a network error, a non-2xx response or a rate limit, THEN THE Fork_Finder SHALL skip the fork step and show one in-theme line stating that the fork inspection failed.
2. IF the forks request fails because of a rate limit and the reset time is known, THEN THE Fork_Finder SHALL include the reset time and the next action in that line.
3. IF the forks request fails, THEN THE Exhume SHALL continue to the CONSULTING state without entering ERROR_GITHUB or ERROR_AI.
4. IF the forks request fails, THEN THE Exhume SHALL show no retry button for the fork step.
5. WHEN forks are fetched for a repository, THEN THE Exhume SHALL cache the result in memory for that repository.
6. WHEN the user presses the AI Retry button, THEN THE Exhume SHALL re-enter CONSULTING without calling the forks endpoint again.

### Requirement 5: Export as Kiro spec
**User Story:** As a developer, I want to export the plan as a Kiro spec, so that I can start executing the revival in Kiro.

#### Acceptance Criteria
1. WHILE the state is RESULTS or FALLBACK, THE Exhume SHALL show the Export_Requirements_Button and the Export_Tasks_Button.
2. WHILE the state is not RESULTS or FALLBACK, THE Exhume SHALL hide the Export_Requirements_Button and the Export_Tasks_Button.
3. WHEN the user activates the Export_Requirements_Button, THEN THE Exhume SHALL download one file named `requirements.md` and no other file.
4. WHEN the user activates the Export_Tasks_Button, THEN THE Exhume SHALL download one file named `tasks.md` and no other file.
5. THE Exhume SHALL trigger at most one download per user activation and SHALL NOT trigger two downloads at once.
6. WHEN a download is triggered, THEN THE Exhume SHALL show one in-theme line naming the exported file.
7. THE Spec_Exporter SHALL generate `tasks.md` with exactly one unchecked checkbox task per plan step, in step order, with the step action as the task title and the rationale as a sub-bullet.
8. THE Spec_Exporter SHALL generate `requirements.md` containing an introduction and requirements derived from the cause of death, severity, vitals, status and plan.
9. THE Spec_Exporter SHALL generate `requirements.md` and `tasks.md` in a format that passes the Kiro spec format validator.
10. WHEN the Report is a Fallback_Report, THEN THE Spec_Exporter SHALL generate the same file structure as for an AI-generated Report.
11. THE Spec_Exporter SHALL generate valid files without depending on a Fork_Recommendation.
12. WHERE a Fork_Recommendation exists, THE Spec_Exporter SHALL reflect it in `requirements.md`.
13. WHEN an export button is activated, THEN THE Exhume SHALL create the download from a Blob, an object URL and an anchor element, and SHALL revoke the object URL after use.
14. THE Exhume SHALL perform the export without a network request.
### Requirement 6: Export determinism and format safety
**User Story:** As a developer, I want predictable, well-formed exported files, so that they open cleanly in Kiro every time.

#### Acceptance Criteria
1. WHEN the same Report, repository owner, repository name and vitals are given, THEN THE Spec_Exporter SHALL produce byte-identical output.
2. THE Spec_Exporter SHALL read no current time and no randomness, and SHALL take any displayed date from the Report generatedAt value.
3. FOR ALL Reports with N steps where N is from 3 to 7, THE Spec_Exporter SHALL generate a `tasks.md` containing exactly N checkbox tasks.
4. WHEN a step action or rationale contains newline characters, THEN THE Spec_Exporter SHALL replace them with single spaces so each task remains a single checkbox line.
5. WHEN a step action or rationale contains Markdown that would start a new list item, heading or checkbox, THEN THE Spec_Exporter SHALL neutralise that Markdown so the task count is unchanged.
6. WHEN a step action or rationale is empty after normalisation, THEN THE Spec_Exporter SHALL substitute a fixed placeholder text so each task has a non-empty title.
7. THE Spec_Exporter SHALL reside in `src/lib` and SHALL import nothing from `src/ui`, `src/github` or `src/ai`.

### Requirement 7: Project constraints and non-regression
**User Story:** As a maintainer, I want the extras to respect the project constraints, so that the existing product keeps working and stays within scope.

#### Acceptance Criteria
1. THE Exhume SHALL add no new package dependencies for these features.
2. THE Exhume SHALL use no backend, user accounts or database for these features.
3. THE Exhume SHALL contain no API keys or secrets in the client bundle and SHALL write no keys or tokens to logs.
4. THE Exhume SHALL send all AI requests for these features only through the AI_Provider.
5. THE Exhume SHALL keep the existing state machine states and transitions, the AI Retry behaviour and the fallback marker line "the spirits are silent — showing instrument readings only." unchanged.
6. WHEN the existing test suite is run after these features are added, THEN THE Exhume SHALL pass all existing tests.
7. THE Exhume SHALL keep RepoVitals unchanged and SHALL NOT add fork data to RepoVitals.
8. THE Exhume SHALL provide Vitest unit tests and fast-check property tests for the Fork_Selector and the Spec_Exporter.
