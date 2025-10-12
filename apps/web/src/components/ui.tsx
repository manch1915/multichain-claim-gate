'use client'

import { shortAddress } from '@mcg/core'
import { Check, Copy, LoaderCircle } from 'lucide-react'
import Link from 'next/link'
import { useState, type ButtonHTMLAttributes, type ComponentProps, type ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost'
type Size = 'sm' | 'md'

const variants: Record<Variant, string> = {
  primary:
    'bg-magenta text-magenta-ink hover:brightness-110 active:brightness-95 disabled:bg-line disabled:text-muted',
  secondary:
    'border border-line-strong bg-surface text-ink hover:border-ink hover:bg-paper disabled:text-muted disabled:hover:border-line-strong',
  ghost: 'text-ink-soft hover:bg-sunk hover:text-ink disabled:text-muted',
}
const sizes: Record<Size, string> = {
  sm: 'h-9 px-3 text-sm gap-1.5',
  md: 'h-11 px-4 text-[0.95rem] gap-2',
}

export function buttonClass(variant: Variant = 'primary', size: Size = 'md', extra = '') {
  return [
    'inline-flex shrink-0 items-center justify-center rounded-control font-medium whitespace-nowrap',
    'transition-[filter,background-color,border-color,color] duration-150 select-none',
    'disabled:cursor-not-allowed',
    variants[variant],
    sizes[size],
    extra,
  ].join(' ')
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  icon?: ReactNode
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  className = '',
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      className={buttonClass(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  )
}

export function ButtonLink({
  variant = 'primary',
  size = 'md',
  className = '',
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />
}

type Tone = 'neutral' | 'go' | 'wait' | 'stop' | 'accent'
const tones: Record<Tone, string> = {
  neutral: 'bg-sunk text-ink-soft',
  go: 'bg-go-soft text-go',
  wait: 'bg-wait-soft text-wait',
  stop: 'bg-stop-soft text-stop',
  accent: 'bg-magenta-soft text-magenta',
}

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-chip px-2 py-0.5 text-[0.8rem] font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  )
}

export function Panel({
  children,
  className = '',
  as: Tag = 'section',
  ...props
}: {
  children: ReactNode
  className?: string
  as?: 'section' | 'div' | 'article' | 'aside'
} & Record<string, unknown>) {
  return (
    <Tag className={`rounded-panel border border-line bg-surface ${className}`} {...props}>
      {children}
    </Tag>
  )
}

export function Address({ value, full = false }: { value: string; full?: boolean }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard blocked; the address is still selectable
    }
  }
  return (
    <span className="inline-flex max-w-full items-center gap-1 font-mono text-[0.85rem]">
      <span className={full ? 'break-all' : 'truncate'} title={value}>
        {full ? value : shortAddress(value)}
      </span>
      <button
        type="button"
        onClick={copy}
        className="grid size-7 shrink-0 place-items-center rounded-chip text-muted hover:bg-sunk hover:text-ink"
        aria-label={copied ? 'Address copied' : 'Copy address'}
      >
        {copied ? (
          <Check className="size-3.5" aria-hidden />
        ) : (
          <Copy className="size-3.5" aria-hidden />
        )}
      </button>
    </span>
  )
}

const chainColors: Record<string, string> = {
  'eip155:11155111': '#7d87a8',
  'eip155:84532': '#2f5cf5',
  'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1': '#8b5cf6',
}

/** A small buoy-like mark in the network's colour, used next to network names. */
export function ChainMark({ chain, className = '' }: { chain: string; className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={`size-4 shrink-0 ${className}`} aria-hidden>
      <circle
        cx="8"
        cy="8"
        r="6.5"
        fill="none"
        stroke={chainColors[chain] ?? '#5a6b7d'}
        strokeWidth="2"
      />
      <circle cx="8" cy="8" r="2.5" fill={chainColors[chain] ?? '#5a6b7d'} />
    </svg>
  )
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <span className={`block animate-pulse rounded-chip bg-sunk ${className}`} aria-hidden />
}

export function InlineError({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-control bg-stop-soft px-3 py-2 text-sm text-stop">
      {children}
    </p>
  )
}
