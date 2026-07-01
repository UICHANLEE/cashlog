import { useId, useMemo, useState } from 'react'

export type LineSeries = {
  id: string
  label: string
  color: string
  values: number[]
}

type LineChartProps = {
  series: LineSeries[]
  xLabels: string[]
  formatValue: (value: number) => string
}

const W = 760
const H = 300
const PAD = { top: 24, right: 20, bottom: 40, left: 64 }
const PLOT_W = W - PAD.left - PAD.right
const PLOT_H = H - PAD.top - PAD.bottom

const niceMax = (raw: number): number => {
  if (raw <= 0) return 1000
  const pow = Math.pow(10, Math.floor(Math.log10(raw)))
  const steps = [1, 2, 2.5, 5, 10]
  for (const s of steps) {
    const candidate = s * pow
    if (candidate >= raw) return candidate
  }
  return 10 * pow
}

const compactWon = (n: number): string => {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`
  if (n >= 10_000) return `${Math.round(n / 10_000).toLocaleString('ko-KR')}만`
  return n.toLocaleString('ko-KR')
}

export function LineChart({ series, xLabels, formatValue }: LineChartProps) {
  const uid = useId().replace(/[:]/g, '')
  const [active, setActive] = useState<number | null>(null)

  const count = xLabels.length
  const maxValue = useMemo(() => {
    const m = Math.max(1, ...series.flatMap((s) => s.values))
    return niceMax(m)
  }, [series])

  const xAt = (i: number) =>
    count <= 1 ? PAD.left + PLOT_W / 2 : PAD.left + (PLOT_W * i) / (count - 1)
  const yAt = (v: number) => PAD.top + PLOT_H - (v / maxValue) * PLOT_H

  const gridLines = [0, 0.25, 0.5, 0.75, 1]

  return (
    <div className="line-chart">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="line-chart-svg"
        role="img"
        aria-label="월별 비교 라인 차트"
        onMouseLeave={() => setActive(null)}
      >
        <defs>
          {series.map((s) => (
            <linearGradient
              key={s.id}
              id={`${uid}-fill-${s.id}`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop offset="0%" stopColor={s.color} stopOpacity="0.28" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>

        {gridLines.map((g) => {
          const y = PAD.top + PLOT_H - g * PLOT_H
          return (
            <g key={g}>
              <line
                x1={PAD.left}
                y1={y}
                x2={W - PAD.right}
                y2={y}
                className="line-chart-grid"
              />
              <text x={PAD.left - 12} y={y + 4} className="line-chart-ytick">
                {compactWon(maxValue * g)}
              </text>
            </g>
          )
        })}

        {xLabels.map((label, i) => (
          <text key={label + i} x={xAt(i)} y={H - 14} className="line-chart-xtick">
            {label}
          </text>
        ))}

        {active != null && (
          <line
            x1={xAt(active)}
            y1={PAD.top}
            x2={xAt(active)}
            y2={PAD.top + PLOT_H}
            className="line-chart-guide"
          />
        )}

        {series.map((s) => {
          const pts = s.values.map((v, i) => `${xAt(i)},${yAt(v)}`)
          const areaPts =
            count > 1
              ? `${PAD.left},${PAD.top + PLOT_H} ${pts.join(' ')} ${
                  PAD.left + PLOT_W
                },${PAD.top + PLOT_H}`
              : ''
          const pathLen = 1400
          return (
            <g key={s.id}>
              {count > 1 && (
                <polygon points={areaPts} fill={`url(#${uid}-fill-${s.id})`} />
              )}
              <polyline
                points={pts.join(' ')}
                fill="none"
                stroke={s.color}
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="line-chart-line"
                style={{ ['--draw-length' as string]: pathLen, strokeDasharray: pathLen }}
              />
              {s.values.map((v, i) => (
                <circle
                  key={i}
                  cx={xAt(i)}
                  cy={yAt(v)}
                  r={active === i ? 6 : 4}
                  fill="var(--surface-1)"
                  stroke={s.color}
                  strokeWidth={3}
                  className="line-chart-dot"
                />
              ))}
            </g>
          )
        })}

        {xLabels.map((_, i) => (
          <rect
            key={i}
            x={count <= 1 ? PAD.left : xAt(i) - PLOT_W / (2 * Math.max(1, count - 1))}
            y={PAD.top}
            width={count <= 1 ? PLOT_W : PLOT_W / Math.max(1, count - 1)}
            height={PLOT_H}
            fill="transparent"
            onMouseEnter={() => setActive(i)}
          />
        ))}
      </svg>

      <div className="line-chart-legend">
        {series.map((s) => (
          <span key={s.id} className="line-chart-legend-item">
            <i style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>

      {active != null && (
        <div className="line-chart-readout" aria-live="polite">
          <strong>{xLabels[active]}</strong>
          {series.map((s) => (
            <span key={s.id}>
              <i style={{ background: s.color }} />
              {s.label} {formatValue(s.values[active] ?? 0)}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
