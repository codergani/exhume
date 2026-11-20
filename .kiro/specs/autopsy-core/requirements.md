# Requirements Document

## Introduction
Exhume analyses a public GitHub repository and produces an autopsy and resurrection plan
in a haunted terminal interface. This spec covers the core MVP.

## Requirements

### Requirement 1: Repo intake
**User Story:** As a developer, I want to paste a GitHub URL in any common form, so that I can start without fixing the link.

#### Acceptance Criteria
1. WHEN the user enters `https://github.com/owner/repo`, with or without `.git`, a trailing slash, or extra path segments, THEN the system SHALL extract the same owner and repo.
2. WHEN the input is not a valid GitHub repo URL THEN the system SHALL show an in-theme error and SHALL NOT call any API.

### Requirement 2: Vital signs
**User Story:** As a developer, I want objective vital signs, so that the verdict is not just an AI opinion.

#### Acceptance Criteria
1. 1. WHEN a repo is fetched THEN the system SHALL compute last push date, archived flag, open issue count, star count and months since last push.
2. WHEN months since last push is 24 or more, or the repo is archived, THEN the system SHALL classify it DEAD.
3. WHEN months since last push is from 12 up to 24 THEN the system SHALL classify it DYING; otherwise ALIVE.
4. WHEN the same inputs are given THEN the classification SHALL be identical (pure, deterministic function).

### Requirement 3: Dependency rot
**User Story:** As a developer, I want to know how outdated the dependencies are, so that I can estimate the revival effort.

#### Acceptance Criteria
1. WHEN the repo has a root `package.json` THEN the system SHALL compare each dependency to the npm registry latest version and report how many major versions behind it is.
2. WHEN no `package.json` exists THEN the system SHALL skip this step and state that clearly, without failing.

### Requirement 4: Autopsy and resurrection plan
**User Story:** As a developer, I want a cause of death and an ordered revival plan, so that I know whether the repo is worth saving.

#### Acceptance Criteria
1. WHEN vitals and dependency rot are ready THEN the system SHALL send them as structured JSON to the AI provider and request a JSON reply with: cause of death, severity, and 3 to 7 ordered steps.
2. WHEN the AI reply does not match the schema THEN the system SHALL retry once, then fall back to a deterministic summary built from the vitals.
3. The system SHALL NOT send raw source code to the AI provider.

### Requirement 5: Haunted terminal experience
**User Story:** As a viewer, I want the result to feel like a haunted terminal, so that the product is memorable.

#### Acceptance Criteria
1. WHILE analysis runs THEN the system SHALL show staged progress lines (fetching, examining, consulting).
2. WHEN results are ready THEN the system SHALL reveal them with a typewriter effect.
3. WHEN the user prefers reduced motion THEN the system SHALL show results instantly with no flicker effects.

### Requirement 6: Resilience and safety
**User Story:** As a user, I want clear states when something fails, so that I am never stuck.

#### Acceptance Criteria
1. WHEN the GitHub rate limit is hit THEN the system SHALL show the reset time and what to do.
2. WHEN the network or AI call fails THEN the system SHALL show a recoverable error and keep the vitals already computed.
3. The client bundle SHALL contain no API keys or secrets.
