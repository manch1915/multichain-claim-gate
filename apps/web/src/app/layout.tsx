import type { Metadata, Viewport } from 'next'
import { Archivo, IBM_Plex_Mono } from 'next/font/google'
import type { ReactNode } from 'react'
import { Providers } from '@/components/providers'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import './globals.css'

const archivo = Archivo({
  subsets: ['latin'],
  axes: ['wdth'],
  variable: '--font-archivo',
  display: 'swap',
})

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-plex-mono',
  display: 'swap',
  // Only addresses and hashes use it, so it should not compete with the headline font.
  preload: false,
})

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: { default: 'Meridian Claim & Gate', template: '%s · Meridian' },
  description:
    'Connect an EVM or Solana wallet, claim MRD on three testnets without paying gas, and open a token-gated lounge.',
  icons: { icon: '/icon.svg' },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#e9eff2' },
    { media: '(prefers-color-scheme: dark)', color: '#0b1622' },
  ],
}

// Runs before paint so the saved or system theme is applied without a flash.
const themeScript = `try{var t=localStorage.getItem('theme');if(!t)t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.dataset.theme=t}catch(e){}`

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${archivo.variable} ${plexMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh">
        <Providers>
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-control focus:bg-surface focus:px-4 focus:py-2"
          >
            Skip to content
          </a>
          <SiteHeader />
          <main id="main" className="mx-auto w-full max-w-6xl px-4 pb-20 sm:px-6">
            {children}
          </main>
          <SiteFooter />
        </Providers>
      </body>
    </html>
  )
}
