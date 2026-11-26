import type { ReadmeResult } from '../lib/readme'

interface ReadmePanelProps {
  result: ReadmeResult
}

export function ReadmePanel({ result }: ReadmePanelProps) {
  if (result.status === 'unavailable') {
    return (
      <p className="readme-note" role="status">
        {result.message}
      </p>
    )
  }

  return (
    <section className="readme" aria-label="README excerpt">
      <h2>README</h2>
      <pre className="readme-text" tabIndex={0} role="region" aria-label="README text, scrollable">
        {result.text}
      </pre>
      {result.truncated && (
        <p className="readme-note">
          [cut at 6000 characters. read the rest at the original README.]
        </p>
      )}
      <a href={result.url} target="_blank" rel="noopener noreferrer">
        Open the original README on GitHub
      </a>
    </section>
  )
}
