interface SampleLabelProps {
  capturedAt: string
  kind: 'fictional' | 'captured'
}

export function SampleLabel({ capturedAt, kind }: SampleLabelProps) {
  const base = `saved sample · frozen snapshot from ${capturedAt.slice(0, 10)}, not live data`
  const text = kind === 'fictional' ? `${base} · fictional repository` : base
  return (
    <p className="sample-label" role="note">
      {text}
    </p>
  )
}
