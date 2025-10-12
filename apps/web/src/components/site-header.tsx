'use client'

import { Moon, Sun } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ConnectButton } from './connect-button'
import { useTheme } from './providers'

const links = [
  { href: '/', label: 'Route' },
  { href: '/claim', label: 'Claim' },
  { href: '/lounge', label: 'Lounge' },
  { href: '/portfolio', label: 'Portfolio' },
  { href: '/admin', label: 'Admin' },
]

export function MeridianMark({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <circle cx="16" cy="16" r="12.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <path
        d="M16 3.5c-4.5 3.6-4.5 21.4 0 25M16 3.5c4.5 3.6 4.5 21.4 0 25"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path d="M3.5 16h25" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2 2" />
      <circle cx="16" cy="16" r="3.2" fill="var(--magenta)" />
    </svg>
  )
}

export function SiteHeader() {
  const pathname = usePathname()
  const { theme, toggle } = useTheme()

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-paper/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2.5 text-ink"
          aria-label="Meridian, back to the route"
        >
          <MeridianMark className="size-8" />
          <span className="type-heading hidden text-[1.05rem] sm:inline">Meridian</span>
        </Link>

        <nav aria-label="Main" className="hidden md:block">
          <ul className="flex items-center gap-1">
            {links.map((link) => (
              <NavLink key={link.href} {...link} active={isActive(pathname, link.href)} />
            ))}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={toggle}
            className="grid size-10 place-items-center rounded-control text-ink-soft hover:bg-sunk hover:text-ink"
            aria-label={theme === 'dark' ? 'Switch to the day chart' : 'Switch to the night chart'}
          >
            {theme === 'dark' ? (
              <Sun className="size-[18px]" aria-hidden />
            ) : (
              <Moon className="size-[18px]" aria-hidden />
            )}
          </button>
          <ConnectButton />
        </div>
      </div>

      <nav aria-label="Main" className="border-t border-line md:hidden">
        <ul className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-3 py-1.5 [scrollbar-width:none]">
          {links.map((link) => (
            <NavLink key={link.href} {...link} active={isActive(pathname, link.href)} />
          ))}
        </ul>
      </nav>
    </header>
  )
}

function isActive(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname.startsWith(href)
}

function NavLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <li>
      <Link
        href={href}
        aria-current={active ? 'page' : undefined}
        className={`relative inline-flex h-9 items-center rounded-control px-3 text-[0.92rem] transition-colors ${
          active ? 'text-ink' : 'text-muted hover:bg-sunk hover:text-ink'
        }`}
      >
        {label}
        {active ? (
          <span
            className="absolute inset-x-3 -bottom-[7px] h-[2px] rounded-full bg-magenta md:-bottom-[15px]"
            aria-hidden
          />
        ) : null}
      </Link>
    </li>
  )
}
