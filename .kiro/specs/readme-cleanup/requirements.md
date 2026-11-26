# Requirements Document

## Introduction
Exhume shows a bounded README excerpt in the README panel and sends the same excerpt to the AI. Real READMEs start with badges, HTML logos and link markup, which waste the 6000-character budget and add noise to both. This spec adds one small pure function that cleans README text before the existing excerpt step. The output stays plain text.

This spec builds on readme-explainer and does not redefine it. `buildReadmeExcerpt`, `README_MAX_CHARS`, `ReadmeResult`, `ReadmePayload`, the README panel, the AI payload, the Zod schema, the state machine, the caches, the AI Retry button and the fallback behaviour are unchanged.

Assumptions:
- "3 or more blank lines" means 3 or more consecutive empty lines, which is 4 or more consecutive newline characters. Two blank lines are left alone; three or more become one. This is an open question for the project owner; the alternative reading ("2 or more blank lines", which would use 3 or more newlines) would change one number in the design.
- The cleaner is a readability aid. It is not a security measure and does not remove instructions hidden in README text; the existing untrusted-data instruction to the AI stays as is.
- Known and accepted limits: a URL containing `)` is cut at the first `)`; reference-style links and images (`[text][ref]`, `[ref]: url`) are not handled; fenced code blocks are not treated specially, so a `# comment` line inside a code fence loses its `#`; HTML entities such as `&amp;` stay as written; text between an opening and closing HTML tag is kept.
- No property-based test is added in this spec. The existing property-based test for `buildReadmeExcerpt` stays valid because that function is unchanged.

## Glossary

- **Exhume**: The client-side web application described by this spec.
- **README_Cleaner**: The pure function `cleanReadmeText` in `src/lib/readmeClean.ts` that turns raw README text into cleaned plain text.
- **Excerpt_Builder**: The existing pure function `buildReadmeExcerpt` in `src/lib/readme.ts`.
- **README_Excerpt**: The bounded text of at most 6000 characters shown in the README_Panel and sent to the AI_Provider.
- **README_Panel**: The existing UI region that shows the README_Excerpt as text nodes.
- **AI_Provider**: The module `src/ai/provider.ts`, the only place that calls the AI.
- **Blank_Line**: A line that is empty or contains only spaces and tabs.
- **Missing_Readme_Line**: The existing in-theme line "no readme was left with these remains."

## Requirements

### Requirement 1: Cleaning rules
**User Story:** As a developer, I want badges, HTML and link markup removed from the README text, so that the panel and the AI see the words of the README and not its decoration.

#### Acceptance Criteria
1. THE README_Cleaner SHALL apply these rules in this order: (1) convert `\r\n` and lone `\r` to `\n`; (2) remove HTML comments, including multi-line comments; (3) remove linked images of the form `[![alt](img)](link)`; (4) remove images of the form `![alt](url)`; (5) convert links of the form `[text](url)` and `[text](url "title")` to `text`; (6) remove HTML tags; (7) remove leading heading markers; (8) remove trailing spaces and tabs from every line; (9) collapse blank lines; (10) trim the whole text.
2. WHEN the text contains an HTML tag such as `<img src="x.png" alt="logo">`, `<br>`, `<br/>`, `<p align="center">` or `</p>`, THEN THE README_Cleaner SHALL remove the tag and keep the text between an opening and a closing tag.
3. WHEN an HTML tag spans several lines, THEN THE README_Cleaner SHALL remove the whole tag.
4. WHEN the text contains `<https://example.com>` or `a < b > c`, THEN THE README_Cleaner SHALL leave that text unchanged, because an HTML tag name must start with a letter and be followed by whitespace, `/` or `>`.
5. WHEN a link has empty text, as in `[](url)`, THEN THE README_Cleaner SHALL leave nothing in its place.
6. WHEN link text contains an HTML tag, as in `[<b>x</b>](u)`, THEN THE README_Cleaner SHALL return `x`.
7. WHEN a line starts with 0 to 3 spaces or tabs, then 1 to 6 `#` characters, then a space or tab, THEN THE README_Cleaner SHALL remove that prefix from the line.
8. WHEN a `#` run is not followed by a space or tab, or has more than 6 `#` characters, as in `#hashtag`, `#!/bin/sh` and `####### seven`, THEN THE README_Cleaner SHALL leave the line unchanged.
9. WHEN the text contains 3 or more consecutive Blank_Lines, THEN THE README_Cleaner SHALL replace them with exactly 1 Blank_Line.
10. WHEN the text contains 1 or 2 consecutive Blank_Lines, THEN THE README_Cleaner SHALL leave them unchanged, so `a\n\n\nb` stays and `a\n\n\n\nb` becomes `a\n\nb`.
11. WHEN the text contains no markup, THEN THE README_Cleaner SHALL return the text unchanged apart from line-ending normalisation, trailing-whitespace removal and trimming.

### Requirement 2: Plain-text output and safety
**User Story:** As a user, I want the cleaned text to stay plain text and the cleaner to stay safe, so that cleaning cannot introduce rendering or performance problems.

#### Acceptance Criteria
1. THE README_Cleaner SHALL return a string and SHALL NOT throw for any string input.
2. WHEN the same input is given, THEN THE README_Cleaner SHALL return an identical output.
3. THE README_Cleaner SHALL be pure: it performs no I/O, reads no global state and has no side effects.
4. THE README_Cleaner SHALL run in time linear in the input length, using only regular expressions without nested quantifiers.
5. THE Exhume SHALL show the cleaned text only as React text nodes, and SHALL NOT introduce an HTML or Markdown renderer or `dangerouslySetInnerHTML` anywhere.
6. THE Exhume SHALL write no README text to logs or URLs as part of cleaning.
7. THE README_Cleaner SHALL reside in `src/lib` and SHALL import nothing from `src/ui`, `src/github` or `src/ai`.
8. THE README_Cleaner SHALL NOT claim to remove instructions hidden in README text, and THE AI_Provider SHALL keep its existing instruction to treat README text as untrusted data unchanged.

### Requirement 3: Pipeline integration
**User Story:** As a user, I want the cleaned text used everywhere the README is used, so that the panel and the AI get less noise within the same size limit.

#### Acceptance Criteria
1. WHEN Exhume builds the README_Excerpt, THEN THE Exhume SHALL call the Excerpt_Builder with the output of the README_Cleaner, so that the cleaner runs before the 6000-character limit.
2. THE Exhume SHALL show in the README_Panel and send to the AI_Provider the same cleaned README_Excerpt.
3. THE Exhume SHALL apply the 6000-character limit and the `truncated` flag to the cleaned text.
4. WHEN a README is longer than 6000 characters raw but 6000 characters or fewer after cleaning, THEN THE Exhume SHALL show it without truncation and with `truncated` set to false.
5. WHEN the cleaned README text is empty, as for a README that contains only badges and HTML, THEN THE Exhume SHALL show the Missing_Readme_Line and still show the report.
6. THE Exhume SHALL keep `buildReadmeExcerpt` in `src/lib/readme.ts` unchanged.
7. THE Exhume SHALL keep only cleaned `available` results in the README cache, and a repeat analysis of the same repository with different letter case SHALL NOT call the README endpoint again.
8. WHEN the user presses the AI Retry button, THEN THE Exhume SHALL re-enter CONSULTING without fetching the README again and with the same cleaned README payload.

### Requirement 4: Tests
**User Story:** As a maintainer, I want example tests that pin each rule, so that a change to a pattern cannot silently change the output.

#### Acceptance Criteria
1. THE Exhume SHALL provide Vitest example tests in `tests/readmeClean.test.ts` and SHALL provide no property-based test for the README_Cleaner.
2. THE tests SHALL cover: `<img src="x.png" alt="logo">` removed; `<p align="center">Hi</p>` giving `Hi`; `<br>` and `<br/>`; a multi-line tag with attributes; a single-line and a multi-line HTML comment; `![alt](url)` removed; `[![Build](https://img.shields.io/x.svg)](https://ci.example)` removed entirely; two adjacent badges on one line leaving an empty line that is collapsed; `[text](url)` giving `text`; `[text](url "title")` giving `text`; `[](url)` leaving nothing; `[<b>x</b>](u)` giving `x`.
3. THE tests SHALL cover: `# Title`, `## Sub`, `###### Six` and a heading indented by 3 spaces losing their markers; `#hashtag`, `#!/bin/sh` and `####### seven` unchanged; `<https://example.com>` and `a < b > c` unchanged.
4. THE tests SHALL cover: 2 blank lines unchanged; 3 and 5 blank lines becoming 1; CRLF input normalised; whitespace-only lines collapsed by the blank-line rule; leading and trailing whitespace trimmed; an input of only badges and tags giving `''`; plain and code-like text without markup unchanged; two calls with the same input giving equal output.
5. THE tests SHALL include one realistic sample README (badges, centred HTML logo, headings, links, a code fence) cleaned to an exact expected string.
6. THE tests SHALL include pathological inputs (100000 repetitions of `[`, 100000 characters of `<a ` repeated, and 50000 `!` followed by `[`) that return a string within 1000 ms measured with `performance.now()`.
7. THE Exhume SHALL append new tests to `tests/App.test.tsx` covering: a README full of badges, HTML and links shown cleaned in the README_Panel with the same text as the 4th argument of `runAutopsy`; a badges-only README showing the Missing_Readme_Line with the report still shown; a README over 6000 characters raw and under 6000 cleaned shown without truncation and sent with `truncated` false; the README cache reused for the same repository with different letter case (one `fetchReadme` call).
8. THE only existing assertions that MAY change are assertions that directly compare README text, and each changed assertion SHALL be listed in the final report with its file, test name, old value and new value.

### Requirement 5: Project constraints and non-regression
**User Story:** As a maintainer, I want this change to stay small and leave the rest of the product alone, so that the existing behaviour and tests keep working.

#### Acceptance Criteria
1. THE Exhume SHALL add no new package dependencies.
2. THE Exhume SHALL use no backend, user accounts or database for this change.
3. THE Exhume SHALL keep the AppState stages and transitions, the AI Retry behaviour, the Zod schema, the AI_Provider and the fallback marker line unchanged.
4. WHEN the existing test suite is run after this change, THEN THE Exhume SHALL pass all existing tests, with only the assertions allowed by Requirement 4.8 changed.
5. THE Exhume SHALL keep all files in `src/lib` free of imports from `src/ui`, `src/github` and `src/ai`.
