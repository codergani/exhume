import type { ReadmeResult } from '../lib/readme'

interface ReadmePanelProps {
  result: ReadmeResult
  savedExcerpt?: boolean
}

export function ReadmePanel({ result, savedExcerpt = false }: ReadmePanelProps) {
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
          {savedExcerpt
            ? '[cut at 6000 characters.]'
            : '[cut at 6000 characters. read the rest at the original README.]'}
        </p>
      )}
      {savedExcerpt ? (
        <p className="readme-note">saved excerpt</p>
      ) : (
        <a href={result.url} target="_blank" rel="noopener noreferrer">
          Open the original README on GitHub
        </a>
      )}
    </section>
  )
}
