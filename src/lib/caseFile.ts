/**
 * Pure loader for saved case files.
 * No I/O, no clock reads, no randomness. Imports nothing from src/ui, src/github or src/ai.
 */
import type { ForkCandidate, ForkResult } from './forks'
import { README_MAX_CHARS } from './readme'

/** Structurally identical to RepoVitals in src/github/client.ts. */
export interface CaseVitals {
  lastPushDate: string
  archived: boolean
  openIssueCount: number
  starCount: number
  monthsSinceLastPush: number
}

/** Structurally identical to AutopsyReport in src/ai/fallback.ts. */
export interface CaseReport {
  causeOfDeath: string
  severity: 'critical' | 'serious' | 'stable'
  steps: Array<{ order: number; action: string; rationale: string }>
  generatedAt: string
  recommendation?: { kind: 'adopt-fork' | 'revive-original'; fork?: string; reason: string }
  overview?: { purpose: string; audience: string; quickStart: string[] }
}

export interface CaseSource {
  kind: 'fictional' | 'captured'
  readmeOrigin: 'written-for-sample' | 'from-repository'
  repository?: string
}

export interface CaseFile {
  id: string
  owner: string
  repo: string
  capturedAt: string
  license: string
  source: CaseSource
  vitals: CaseVitals
  forks: Extract<ForkResult, { status: 'available' | 'skipped' }>
  readme: { text: string; truncated: boolean }
  report: CaseReport
}

export type CaseLoadResult = { ok: true; case: CaseFile } | { ok: false; reason: string }

/** The minimal surface of a Zod schema; the caller injects autopsyReportSchema. */
export interface ReportValidator<T> {
  safeParse(input: unknown): { success: true; data: T } | { success: false }
}

const ID_PATTERN = /^[a-z0-9-]{1,40}$/
const NAME_PATTERN = /^[A-Za-z0-9._-]{1,100}$/
const ISO_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/
// eslint-disable-next-line no-control-regex
const BAD_README_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/
const GITHUB_PREFIX = 'https://github.com/'

type Rec = Record<string, unknown>

const fail = (reason: string): CaseLoadResult => ({ ok: false, reason })

function isRec(v: unknown): v is Rec {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isIso(v: unknown): v is string {
  return typeof v === 'string' && ISO_PATTERN.test(v) && !Number.isNaN(Date.parse(v))
}

function isCount(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0
}

function isName(v: unknown): v is string {
  return typeof v === 'string' && NAME_PATTERN.test(v)
}

function parseFork(v: unknown): ForkCandidate | null {
  if (!isRec(v)) return null
  if (!isName(v.owner) || !isName(v.name)) return null
  if (typeof v.htmlUrl !== 'string' || !v.htmlUrl.startsWith(GITHUB_PREFIX)) return null
  if (!isCount(v.starCount) || !isIso(v.lastPushDate)) return null
  if (typeof v.archived !== 'boolean') return null
  return {
    owner: v.owner,
    name: v.name,
    htmlUrl: v.htmlUrl,
    starCount: v.starCount,
    lastPushDate: v.lastPushDate,
    archived: v.archived,
  }
}

export function loadCaseFile(
  input: unknown,
  validateReport: ReportValidator<Omit<CaseReport, 'generatedAt'>>,
): CaseLoadResult {
  try {
    if (!isRec(input)) return fail('not a case file')

    const { id, owner, repo, license, capturedAt } = input
    if (typeof id !== 'string' || !ID_PATTERN.test(id)) return fail('invalid id')
    if (!isName(owner)) return fail('invalid owner')
    if (!isName(repo)) return fail('invalid repo')
    if (typeof license !== 'string' || license.trim() === '') return fail('invalid license')
    if (!isIso(capturedAt)) return fail('invalid capturedAt date')

    // vitals
    const v = input.vitals
    if (!isRec(v)) return fail('invalid vitals')
    if (!isIso(v.lastPushDate)) return fail('invalid vitals date')
    if (typeof v.archived !== 'boolean') return fail('invalid vitals archived flag')
    if (
      !isCount(v.monthsSinceLastPush) ||
      !isCount(v.openIssueCount) ||
      !isCount(v.starCount)
    ) {
      return fail('invalid vitals number')
    }
    const vitals: CaseVitals = {
      lastPushDate: v.lastPushDate,
      archived: v.archived,
      openIssueCount: v.openIssueCount,
      starCount: v.starCount,
      monthsSinceLastPush: v.monthsSinceLastPush,
    }

    // forks
    const f = input.forks
    if (!isRec(f)) return fail('invalid forks')
    let forks: CaseFile['forks']
    if (f.status === 'skipped') {
      forks = { status: 'skipped' }
    } else if (f.status === 'available') {
      if (!Array.isArray(f.living) || f.living.length > 3) return fail('invalid living forks')
      if (!isCount(f.inspected) || !isCount(f.livingTotal)) return fail('invalid fork counts')
      if (f.livingTotal < f.living.length || f.inspected < f.livingTotal) {
        return fail('inconsistent fork counts')
      }
      const living: ForkCandidate[] = []
      for (const entry of f.living as unknown[]) {
        const fork = parseFork(entry)
        if (!fork) return fail('invalid fork entry')
        living.push(fork)
      }
      forks = {
        status: 'available',
        living,
        inspected: f.inspected,
        livingTotal: f.livingTotal,
      }
    } else {
      return fail('invalid forks status')
    }

    // readme
    const r = input.readme
    if (!isRec(r)) return fail('invalid readme')
    if (typeof r.text !== 'string' || r.text.trim() === '') return fail('invalid readme text')
    if (r.text.length > README_MAX_CHARS) return fail('readme too long')
    if (BAD_README_CHARS.test(r.text)) return fail('readme has control characters')
    if (typeof r.truncated !== 'boolean') return fail('invalid readme truncated flag')

    // source
    const s = input.source
    if (!isRec(s)) return fail('invalid source')
    if (s.kind !== 'fictional' && s.kind !== 'captured') return fail('invalid source kind')
    if (s.readmeOrigin !== 'written-for-sample' && s.readmeOrigin !== 'from-repository') {
      return fail('invalid source readme origin')
    }
    const source: CaseSource = { kind: s.kind, readmeOrigin: s.readmeOrigin }
    if (s.readmeOrigin === 'from-repository') {
      if (typeof s.repository !== 'string' || !/^[^/\s]+\/[^/\s]+$/.test(s.repository)) {
        return fail('source repository missing')
      }
      source.repository = s.repository
    } else if (typeof s.repository === 'string') {
      source.repository = s.repository
    }

    // report
    const rawReport = input.report
    if (!isRec(rawReport)) return fail('invalid report')
    const parsed = validateReport.safeParse(rawReport)
    if (!parsed.success) return fail('report does not match the schema')
    if (!isIso(rawReport.generatedAt)) return fail('invalid report date')
    const d = parsed.data
    const report: CaseReport = {
      causeOfDeath: d.causeOfDeath,
      severity: d.severity,
      steps: d.steps.map((st) => ({
        order: st.order,
        action: st.action,
        rationale: st.rationale,
      })),
      generatedAt: rawReport.generatedAt,
    }
    if (d.recommendation) {
      report.recommendation = { ...d.recommendation }
    }
    if (d.overview) {
      report.overview = {
        purpose: d.overview.purpose,
        audience: d.overview.audience,
        quickStart: [...d.overview.quickStart],
      }
    }

    return {
      ok: true,
      case: {
        id,
        owner,
        repo,
        capturedAt,
        license,
        source,
        vitals,
        forks,
        readme: { text: r.text, truncated: r.truncated },
        report,
      },
    }
  } catch {
    return fail('unreadable case file')
  }
}
