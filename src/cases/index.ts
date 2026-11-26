import { autopsyReportSchema } from '../ai/schema'
import { loadCaseFile, type CaseFile } from '../lib/caseFile'

const modules = import.meta.glob('./*.json', { eager: true, import: 'default' }) as Record<
  string,
  unknown
>

const results = Object.entries(modules)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([, json]) => loadCaseFile(json, autopsyReportSchema))

/** Valid cases only, sorted by id. */
export const savedCases: CaseFile[] = results
  .flatMap((r) => (r.ok ? [r.case] : []))
  .sort((a, b) => a.id.localeCompare(b.id))

/** Count of files the loader rejected. Used by tests; never logged. */
export const rejectedCaseCount: number = results.filter((r) => !r.ok).length
