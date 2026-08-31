import { formatMoney } from '../../utils/format.js'

const WIDTH = 720
const HEIGHT = 220
const PADDING = { top: 16, right: 16, bottom: 28, left: 64 }

/**
 * Inline SVG area/line chart of daily revenue. Deliberately dependency-free:
 * the dataset is small and bounded by the API's date-range cap.
 */
export function RevenueChart({ series }) {
  if (!series || series.length === 0) {
    return <p className="admin-subtle">No paid orders in this period.</p>
  }

  const plotWidth = WIDTH - PADDING.left - PADDING.right
  const plotHeight = HEIGHT - PADDING.top - PADDING.bottom
  const maxRevenue = Math.max(...series.map((point) => point.revenueMinor), 1)

  const x = (index) =>
    PADDING.left + (series.length === 1 ? plotWidth / 2 : (index / (series.length - 1)) * plotWidth)
  const y = (value) => PADDING.top + plotHeight - (value / maxRevenue) * plotHeight

  const line = series.map((point, index) => `${x(index)},${y(point.revenueMinor)}`).join(' ')
  const area = `${PADDING.left},${PADDING.top + plotHeight} ${line} ${x(series.length - 1)},${
    PADDING.top + plotHeight
  }`

  const ticks = [0, 0.5, 1].map((fraction) => ({
    value: maxRevenue * fraction,
    y: y(maxRevenue * fraction),
  }))

  return (
    <figure className="chart-figure">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="revenue-chart"
        role="img"
        aria-label={`Daily revenue across ${series.length} days, peaking at ${formatMoney(
          maxRevenue,
          'USD',
        )}`}
      >
        {ticks.map((tick) => (
          <g key={tick.y}>
            <line
              x1={PADDING.left}
              x2={WIDTH - PADDING.right}
              y1={tick.y}
              y2={tick.y}
              className="chart-gridline"
            />
            <text x={PADDING.left - 8} y={tick.y + 4} className="chart-axis-label" textAnchor="end">
              {formatMoney(Math.round(tick.value), 'USD')}
            </text>
          </g>
        ))}

        <polygon points={area} className="chart-area" />
        <polyline points={line} className="chart-line" />
        {series.map((point, index) => (
          <circle
            key={point.date}
            cx={x(index)}
            cy={y(point.revenueMinor)}
            r="3"
            className="chart-dot"
          >
            <title>
              {point.date}: {formatMoney(point.revenueMinor, 'USD')} ({point.orders} orders)
            </title>
          </circle>
        ))}

        {series.length === 1 ? (
          <text x={x(0)} y={HEIGHT - 8} className="chart-axis-label" textAnchor="middle">
            {series[0].date}
          </text>
        ) : (
          <>
            <text x={PADDING.left} y={HEIGHT - 8} className="chart-axis-label">
              {series[0].date}
            </text>
            <text
              x={WIDTH - PADDING.right}
              y={HEIGHT - 8}
              className="chart-axis-label"
              textAnchor="end"
            >
              {series.at(-1).date}
            </text>
          </>
        )}
      </svg>
    </figure>
  )
}

export function StatusBars({ title, counts }) {
  const entries = Object.entries(counts ?? {}).filter(([, count]) => count > 0)
  if (entries.length === 0) return null
  const max = Math.max(...entries.map(([, count]) => count))

  return (
    <div className="status-bars">
      <h4>{title}</h4>
      {entries.map(([label, count]) => (
        <div key={label} className="status-bar-row">
          <span className="status-bar-label">{label}</span>
          <span className="status-bar-track">
            <span className="status-bar-fill" style={{ width: `${(count / max) * 100}%` }} />
          </span>
          <span className="status-bar-count">{count}</span>
        </div>
      ))}
    </div>
  )
}
