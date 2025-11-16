// Depth contours drawn inline rather than as a CSS background, so the hero needs no extra request
// and the lines follow the theme colours.
const CENTER_X = 560
const CENTER_Y = 300

function contour(level: number): string {
  const base = 70 + level * 46
  const points: string[] = []
  for (let i = 0; i <= 96; i++) {
    const angle = (i / 96) * Math.PI * 2
    const radius =
      base +
      18 * Math.sin(3 * angle + level * 0.55) +
      11 * Math.sin(5 * angle - level * 0.9) +
      6 * Math.cos(7 * angle + level * 0.3)
    const x = CENTER_X + radius * Math.cos(angle) * 1.35
    const y = CENTER_Y + radius * Math.sin(angle)
    points.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`)
  }
  return `${points.join(' ')}Z`
}

const contours = Array.from({ length: 9 }, (_, level) => ({
  d: contour(level),
  dashed: level % 3 === 2,
}))

export function ContourLines({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 900 700"
      fill="none"
      className={`pointer-events-none absolute ${className}`}
      aria-hidden
    >
      {contours.map(({ d, dashed }) => (
        <path
          key={d.slice(0, 24)}
          d={d}
          stroke="var(--line-strong)"
          strokeOpacity="0.55"
          strokeDasharray={dashed ? '6 6' : undefined}
        />
      ))}
    </svg>
  )
}
