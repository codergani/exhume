# Exhume: tech steering

- Stack: Vite + React + TypeScript (strict). No custom backend. Hosted on Firebase Hosting.
- All LLM calls go through `src/ai/provider.ts` only. It wraps Firebase AI Logic and exposes one
  function per task. Inference mode (cloud now, hybrid on-device later) is a single config value there.
- No API keys or secrets in the repo or the client bundle. Firebase App Check is on.
- Deterministic analysis first, LLM second: compute vitals in plain code, then give the LLM structured
  JSON (never raw source files) and validate its JSON reply against a schema before using it.
- GitHub data: public REST API, unauthenticated by default (60 requests/hour). Cache results in memory.
  Handle rate limits with a clear UI state.
- Tests: Vitest. Use property-based tests (fast-check) for pure functions: URL parsing and status classification.
- Accessibility: respect prefers-reduced-motion; terminal text must stay readable (contrast).
- License: Apache-2.0. The /.kiro directory must stay committed (never in .gitignore).
