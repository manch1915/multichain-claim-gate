import type { ReactNode } from 'react'

export function PageIntro({
  title,
  body,
  aside,
}: {
  title: string
  body: string
  aside?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-4 pt-10 pb-8 sm:flex-row sm:items-end sm:justify-between sm:pt-14">
      <div>
        <h1 className="type-chart text-[1.9rem] sm:text-[2.5rem]">{title}</h1>
        <p className="mt-3 max-w-2xl text-ink-soft">{body}</p>
      </div>
      {aside}
    </div>
  )
}
