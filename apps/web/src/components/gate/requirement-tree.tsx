import type { EvaluationResult } from '@mcg/core'
import { chainByCaip2 } from '@mcg/core/chains'
import { Check, Minus, X } from 'lucide-react'
import { ChainMark } from '../ui'

export function RequirementTree({ result }: { result: EvaluationResult }) {
  return (
    <div className="text-[0.95rem]">
      <Node result={result} depth={0} />
    </div>
  )
}

function Node({ result, depth }: { result: EvaluationResult; depth: number }) {
  if (result.type === 'group') {
    return (
      <div className={depth > 0 ? 'mt-2' : ''}>
        <p className="flex items-center gap-2 font-medium">
          <StatusIcon passed={result.passed} />
          {result.label}
          <span className="text-sm font-normal text-muted">
            {result.kind === 'all' ? 'every item must hold' : 'one item is enough'}
          </span>
        </p>
        <ul className="mt-2 ml-[11px] grid gap-2 border-l border-line pl-5">
          {result.children.map((child, i) => (
            <li key={i}>
              <Node result={child} depth={depth + 1} />
            </li>
          ))}
        </ul>
      </div>
    )
  }

  const chain = chainByCaip2(result.condition.chain)
  return (
    <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
      <StatusIcon passed={result.passed} missing={result.missingAccount} />
      <span className="min-w-0 flex-1">
        <span className={result.passed ? 'text-ink' : 'text-ink-soft'}>{result.label}</span>
        <span className="mt-0.5 flex items-center gap-1.5 text-sm text-muted">
          <ChainMark chain={result.condition.chain} className="size-3.5" />
          {result.missingAccount ? (
            `No ${chain?.family === 'solana' ? 'Solana' : 'EVM'} wallet linked`
          ) : (
            <span className="nums">
              You hold {result.actual} of {result.required}
            </span>
          )}
        </span>
      </span>
    </div>
  )
}

function StatusIcon({ passed, missing = false }: { passed: boolean; missing?: boolean }) {
  if (passed) {
    return (
      <span className="grid size-[22px] shrink-0 place-items-center rounded-full bg-go text-white">
        <Check className="size-3.5" aria-hidden />
        <span className="sr-only">Met:</span>
      </span>
    )
  }
  return (
    <span
      className={`grid size-[22px] shrink-0 place-items-center rounded-full border ${
        missing ? 'border-line-strong text-muted' : 'border-stop/50 text-stop'
      }`}
    >
      {missing ? (
        <Minus className="size-3.5" aria-hidden />
      ) : (
        <X className="size-3.5" aria-hidden />
      )}
      <span className="sr-only">{missing ? 'Not checked:' : 'Not met:'}</span>
    </span>
  )
}
