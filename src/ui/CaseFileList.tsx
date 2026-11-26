import type { CaseFile } from '../lib/caseFile'
import { classifyStatus } from '../lib/classifyStatus'
import { statusLabel } from '../lib/statusLabel'

interface CaseFileListProps {
  cases: CaseFile[]
  onOpen: (c: CaseFile) => void
}

export function CaseFileList({ cases, onOpen }: CaseFileListProps) {
  if (cases.length === 0) return null

  return (
    <section className="cases" aria-labelledby="cases-title">
      <h2 id="cases-title">Saved case files</h2>
      <ul>
        {cases.map((c) => {
          const label = statusLabel(classifyStatus(c.vitals), c.vitals.monthsSinceLastPush)
          return (
            <li key={c.id}>
              <button type="button" onClick={() => onOpen(c)}>
                {`${c.owner}/${c.repo} · ${label} · captured ${c.capturedAt.slice(0, 10)}`}
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
