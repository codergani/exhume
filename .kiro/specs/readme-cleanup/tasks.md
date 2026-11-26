# Implementation Plan: readme-cleanup

## Overview

Add one pure function that cleans README text before the existing excerpt step, then wire it into `findReadme`. Three tasks: the function with its tests (task 1), the wiring with the App tests (task 2), and a checkpoint (task 3). All tests are example tests; there is no property-based test in this spec.

Constraints for every task: no new dependencies, no backend, no accounts. Do not modify `requirements.md` or `design.md` of this spec, and do not modify any file under `.kiro/specs/autopsy-core/`, `.kiro/specs/revival-extras/`, `.kiro/specs/readme-explainer/` or `.kiro/specs/case-files/`. `src/lib/readme.ts` stays unchanged. Files in `src/lib` import nothing from `src/ui`, `src/github` or `src/ai`. `AppState`, transitions, AI Retry, the schema, the provider and the fallback marker line stay unchanged. No Markdown or HTML renderer and no `dangerouslySetInnerHTML`.

## Tasks

- [x] 1. `src/lib/readmeClean.ts` and `tests/readmeClean.test.ts`
  - Create `src/lib/readmeClean.ts` (pure, never throws, no imports from ui/github/ai) exporting `cleanReadmeText(raw: string): string`, applying the ten rules in the exact order from design.md: line endings, HTML comments (indexOf loop), linked images, images, links, HTML tags, heading markers, per-line `trimEnd`, `\n{3,}` to `\n\n`, whole-text `trim`
  - Use the character classes from design.md (`[^[\]]*` and `[^()]*`) so no input causes quadratic scanning
  - Create `tests/readmeClean.test.ts` with example tests only: `<img src="x.png" alt="logo">` removed; `<p align="center">Hi</p>` gives `Hi`; `<br>` and `<br/>`; a multi-line tag with attributes; single-line and multi-line HTML comments, and an unclosed `<!--` left as written; `![alt](url)` removed; `[![Build](https://img.shields.io/x.svg)](https://ci.example)` removed entirely; two adjacent badges on one line leave an empty line that is collapsed; `[text](url)` and `[text](url "title")` give `text`; `[](url)` leaves nothing; `[<b>x</b>](u)` gives `x`; `# Title`, `## Sub`, `###### Six` and a heading indented by 3 spaces lose their markers; `#hashtag`, `#!/bin/sh` and `####### seven` are unchanged; `<https://example.com>` and `a < b > c` are unchanged; 1 blank line unchanged, 2, 3 and 5 blank lines become 1; CRLF normalised; whitespace-only lines collapsed; leading and trailing whitespace trimmed; an input of only badges and tags gives `''`; plain and code-like text is unchanged; the same input twice gives equal output
  - Add one realistic sample README (badges, centred HTML logo, headings, links, a code fence) cleaned to an exact expected string
  - Add pathological-input tests (`'['.repeat(100000)`, `'<a '.repeat(100000)`, `'!'.repeat(50000) + '['`, `'<!--'.repeat(50000)`, `' '.repeat(100000) + 'x'`), each asserting a string result in under 1000 ms using `performance.now()`
  - Run `npm test`, `npx tsc -b` and `npm run lint`
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 1.11, 2.1, 2.2, 2.3, 2.4, 2.7, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

- [x] 2. Wire into `src/App.tsx` and update `tests/App.test.tsx`
  - In `src/App.tsx` add `import { cleanReadmeText } from './lib/readmeClean'` and change the one call in `findReadme` to `buildReadmeExcerpt(cleanReadmeText(text))`; change nothing else in that file
  - In `tests/App.test.tsx` change ONLY assertions that directly compare README text. Expected: in `runAutopsy receives an available payload when the README exists`, the payload `text` changes from `'# Widget\n\nA tiny library.'` to `'Widget\n\nA tiny library.'`
  - Append tests inside `describe('App readme explainer')`: a README full of badges, HTML and links is shown cleaned in the README panel and the 4th `runAutopsy` argument has the same cleaned text; a badges-only README shows `no readme was left with these remains.` once, the report still appears and there is no `role="alert"`; a README over 6000 characters raw and under 6000 cleaned is shown without the truncation note and the payload has `truncated: false`; a second analysis of the same repository with different letter case and a markup-heavy README calls `fetchReadme` once
  - Report every changed assertion with file, test name, old value and new value. If any other existing assertion would break, stop and report instead of editing it
  - Run `npm test`, `npx tsc -b` and `npm run lint`
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 4.7, 4.8, 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] 3. Checkpoint - README cleanup is shippable
  - Run `npm test`, `npm run lint` and `npm run build`; all must pass
  - Confirm with `git diff` that no existing assertion changed except README-text comparisons, that `src/lib/readme.ts` is unchanged, that `package.json` has no new dependencies, and that nothing under `.kiro/specs/autopsy-core/`, `.kiro/specs/revival-extras/`, `.kiro/specs/readme-explainer/` or `.kiro/specs/case-files/` changed
  - Confirm that `grep dangerouslySetInnerHTML src` finds nothing
  - Ask the user to smoke-test in the browser with a badge-heavy README (for example a popular repository) and wait for approval
  - _Requirements: 2.5, 3.6, 4.8, 5.1, 5.3, 5.4_

## Notes

- All tests are example tests. This spec adds no property-based test; the existing one for `buildReadmeExcerpt` stays valid because that function is unchanged.
- Blank lines (decided by the user): 2 or more consecutive blank lines become 1, implemented as `\n{3,}` to `\n\n`; a single blank line stays.
- Accepted limits: URLs or link text containing brackets or parentheses are not converted; reference-style links are not handled; fenced code blocks are not treated specially (a `# comment` in a fence loses its `#`); HTML entities stay as written; text between HTML tags is kept; the cleaner is not a security measure.
- The character classes `[^[\]]*` and `[^()]*`, the comment loop and the per-line `trimEnd` are deliberate guards against quadratic scanning; do not simplify them to the plain forms.
- Each task references the requirements it satisfies for traceability.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1"] },
    { "id": 1, "tasks": ["2"] },
    { "id": 2, "tasks": ["3"] }
  ]
}
```
