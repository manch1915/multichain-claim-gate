'use client'

import { Check } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { waypointState, type WaypointState } from '@/hooks/use-route-progress'

export interface Waypoint {
  title: string
  note: string
}

interface Point {
  x: number
  y: number
}

// Positions on a 1000×340 chart. The course bends like a real passage plan, not a straight bar.
const points: Point[] = [
  { x: 90, y: 250 },
  { x: 360, y: 120 },
  { x: 640, y: 210 },
  { x: 900, y: 90 },
]
const legs = points.slice(1).map((to, i) => ({ from: points[i] ?? to, to }))

function curve({ from, to }: { from: Point; to: Point }) {
  const mx = (from.x + to.x) / 2
  return `M${from.x} ${from.y} C${mx} ${from.y} ${mx} ${to.y} ${to.x} ${to.y}`
}

export function CourseChart({ waypoints, current }: { waypoints: Waypoint[]; current: number }) {
  const reduceMotion = useReducedMotion()

  return (
    <>
      <figure className="relative hidden md:block" aria-label="Demo route">
        <svg viewBox="0 0 1000 340" className="w-full" role="img" aria-hidden>
          <Graticule />
          {legs.map((leg, i) => {
            const travelled = i < current
            return (
              <g key={i}>
                <path
                  d={curve(leg)}
                  fill="none"
                  stroke="var(--line-strong)"
                  strokeWidth="2"
                  strokeDasharray="7 7"
                />
                {travelled ? (
                  <motion.path
                    d={curve(leg)}
                    fill="none"
                    stroke="var(--magenta)"
                    strokeWidth="3"
                    strokeLinecap="round"
                    initial={reduceMotion ? false : { pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.7, delay: 0.25 + i * 0.45, ease: [0.4, 0, 0.2, 1] }}
                  />
                ) : null}
              </g>
            )
          })}
          {points.map((point, i) => (
            <Marker key={i} x={point.x} y={point.y} index={i} state={waypointState(i, current)} />
          ))}
        </svg>
        <ol className="pointer-events-none absolute inset-0">
          {points.map((point, i) => {
            const waypoint = waypoints[i]
            if (!waypoint) return null
            return (
              <li
                key={waypoint.title}
                className="absolute w-[22%]"
                style={{
                  left: `${point.x / 10}%`,
                  top: `${((point.y + 34) / 340) * 100}%`,
                  // Edge labels hang inwards so they never run off the chart.
                  transform: `translateX(${i === 0 ? '-20%' : i === points.length - 1 ? '-80%' : '-50%'})`,
                }}
              >
                <WaypointLabel
                  waypoint={waypoint}
                  index={i}
                  state={waypointState(i, current)}
                  align={i === 0 ? 'left' : i === points.length - 1 ? 'right' : 'center'}
                />
              </li>
            )
          })}
        </ol>
      </figure>

      <ol
        className="relative grid gap-6 border-l-2 border-dashed border-line-strong pl-6 md:hidden"
        aria-label="Demo route"
      >
        {waypoints.map((waypoint, i) => {
          const state = waypointState(i, current)
          return (
            <li key={waypoint.title} className="relative">
              <span
                className={`absolute top-0.5 -left-[35px] grid size-6 place-items-center rounded-full border-2 text-xs font-semibold ${markerClass(state)}`}
                aria-hidden
              >
                {state === 'done' ? <Check className="size-3.5" /> : i + 1}
              </span>
              <WaypointLabel waypoint={waypoint} index={i} state={state} align="left" />
            </li>
          )
        })}
      </ol>
    </>
  )
}

function markerClass(state: WaypointState) {
  if (state === 'done') return 'border-magenta bg-magenta text-magenta-ink'
  if (state === 'current') return 'border-magenta bg-surface text-magenta'
  return 'border-line-strong bg-surface text-muted'
}

function WaypointLabel({
  waypoint,
  index,
  state,
  align = 'center',
}: {
  waypoint: Waypoint
  index: number
  state: WaypointState
  align?: 'center' | 'left' | 'right'
}) {
  const status = state === 'done' ? 'done' : state === 'current' ? 'next up' : 'ahead'
  return (
    <div className={align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : ''}>
      <p
        className={`type-heading text-[1.02rem] ${state === 'ahead' ? 'text-ink-soft' : 'text-ink'}`}
      >
        <span className="sr-only">
          Step {index + 1}, {status}:{' '}
        </span>
        {waypoint.title}
      </p>
      <p className="type-water mt-0.5 text-[0.88rem] text-muted">{waypoint.note}</p>
    </div>
  )
}

function Marker({
  x,
  y,
  index,
  state,
}: {
  x: number
  y: number
  index: number
  state: WaypointState
}) {
  const ring = state === 'ahead' ? 'var(--line-strong)' : 'var(--magenta)'
  return (
    <g>
      {state === 'current' ? (
        <circle
          cx={x}
          cy={y}
          r="24"
          fill="none"
          stroke="var(--magenta)"
          strokeOpacity="0.25"
          strokeWidth="6"
        />
      ) : null}
      <circle
        cx={x}
        cy={y}
        r="16"
        fill={state === 'done' ? 'var(--magenta)' : 'var(--surface)'}
        stroke={ring}
        strokeWidth="2.5"
      />
      {state === 'done' ? (
        <path
          d={`M${x - 6} ${y} l4 4 l8 -9`}
          fill="none"
          stroke="var(--magenta-ink)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : (
        <text
          x={x}
          y={y + 5}
          textAnchor="middle"
          fontSize="15"
          fontWeight="600"
          fill={state === 'current' ? 'var(--magenta)' : 'var(--muted)'}
          fontFamily="var(--font-archivo)"
        >
          {index + 1}
        </text>
      )}
    </g>
  )
}

/** Meridians and parallels, the grid every chart is drawn on. */
function Graticule() {
  return (
    <g stroke="var(--line)" strokeWidth="1">
      {[100, 300, 500, 700, 900].map((x) => (
        <line key={`m${x}`} x1={x} y1="0" x2={x} y2="340" />
      ))}
      {[60, 170, 280].map((y) => (
        <line key={`p${y}`} x1="0" y1={y} x2="1000" y2={y} />
      ))}
    </g>
  )
}
