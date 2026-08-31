export function StatCard({ label, value, hint, tone }) {
  return (
    <article className={tone ? `stat-card stat-${tone}` : 'stat-card'}>
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
      {hint && <span className="stat-hint">{hint}</span>}
    </article>
  )
}
