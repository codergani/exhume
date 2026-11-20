# Exhume: structure steering

src/
  lib/        pure functions (parseRepoUrl, classifyStatus, depRot): no I/O, fully tested
  github/     GitHub API client + types
  ai/         provider.ts (only place that touches Firebase AI Logic) + schemas
  ui/         Terminal.tsx, Typewriter.tsx, theme.css
  App.tsx
tests/        mirrors src/lib
Rule: files in src/lib import nothing from src/ui, src/github or src/ai.
