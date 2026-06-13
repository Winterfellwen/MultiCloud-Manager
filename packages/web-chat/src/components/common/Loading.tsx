interface LoadingProps {
  text?: string
}

export function Loading({ text = 'Loading...' }: LoadingProps) {
  return (
    <div className="loading">
      <div className="loading-spinner" />
      <span>{text}</span>
    </div>
  )
}
