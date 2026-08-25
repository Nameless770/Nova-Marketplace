export function ErrorState({ message = 'Something went wrong', onRetry }) {
  return (
    <div className="state-panel error-panel" role="alert">
      <strong>Unable to load this view</strong>
      <span>{message}</span>
      {onRetry && <button onClick={onRetry}>Try again</button>}
    </div>
  )
}
