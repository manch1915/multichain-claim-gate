import {
  evaluateRule,
  familyOfChain,
  rule as ruleSchema,
  type Condition,
  type EvaluationResult,
} from '@mcg/core'
import { z } from 'zod'
import { AppError } from '../domain/errors.js'
import type { Gate, Session } from '../domain/models.js'
import type { BalanceReader, TelegramInviter } from '../ports/chains.js'
import type { GateRepository } from '../ports/repositories.js'

export const gateInput = z.object({
  title: z.string().min(3).max(80),
  summary: z.string().min(3).max(240),
  rule: ruleSchema,
  content: z.object({
    heading: z.string().min(1).max(120),
    body: z.string().min(1).max(4000),
    links: z
      .array(z.object({ label: z.string().min(1).max(60), href: z.url() }))
      .max(6)
      .default([]),
  }),
  telegramEnabled: z.boolean().default(false),
})

export interface GateCheckResult {
  gateId: string
  passed: boolean
  result: EvaluationResult
  content: Gate['content'] | null
  telegram: { url: string; expiresAt: Date } | null
  telegramAvailable: boolean
}

export class GateService {
  private readonly invites = new Map<string, { url: string; expiresAt: Date }>()

  constructor(
    private readonly gates: GateRepository,
    private readonly balances: BalanceReader,
    private readonly telegram: TelegramInviter,
  ) {}

  async list() {
    const gates = await this.gates.list()
    return gates.map(({ content: _content, ...gate }) => gate)
  }

  async get(id: string): Promise<Gate> {
    const gate = await this.gates.find(id)
    if (!gate) throw new AppError('not_found', 'This gated page does not exist')
    return gate
  }

  /** Evaluated on every request from live balances; the content never reaches a client that fails. */
  async check(id: string, session: Session | undefined): Promise<GateCheckResult> {
    const gate = await this.get(id)
    const accounts = session?.accounts ?? []
    const result = await evaluateRule(gate.rule, (condition) => this.measure(condition, accounts))

    await this.gates.recordCheck(
      gate.id,
      accounts.map((account) => `${account.chain}:${account.address}`),
      result.passed,
    )

    const telegramAvailable = gate.telegramEnabled && this.telegram.enabled
    return {
      gateId: gate.id,
      passed: result.passed,
      result,
      content: result.passed ? gate.content : null,
      telegram: null,
      telegramAvailable,
    }
  }

  async telegramInvite(id: string, session: Session | undefined) {
    if (!session) throw new AppError('unauthorized', 'Sign in with a wallet first')
    const check = await this.check(id, session)
    if (!check.passed)
      throw new AppError('forbidden', 'Your wallets do not meet the requirements yet')
    if (!check.telegramAvailable)
      throw new AppError('not_configured', 'Telegram access is not enabled')

    // One live invite per session, so refreshing the page does not mint new links.
    const key = `${id}:${session.id}`
    const cached = this.invites.get(key)
    if (cached && cached.expiresAt.getTime() > Date.now() + 60_000) return cached
    const invite = await this.telegram.createInvite(`gate ${id}`)
    this.invites.set(key, invite)
    return invite
  }

  async upsert(id: string, input: unknown): Promise<Gate> {
    const parsed = gateInput.safeParse(input)
    if (!parsed.success) throw new AppError('bad_request', 'Invalid gate', parsed.error.issues)
    const gate: Gate = { id, ...parsed.data, updatedAt: new Date() }
    await this.gates.upsert(gate)
    return gate
  }

  private async measure(
    condition: Condition,
    accounts: Session['accounts'],
  ): Promise<bigint | null> {
    const family = familyOfChain(condition.chain)
    const account = accounts.find((item) => item.family === family)
    if (!account) return null
    switch (condition.kind) {
      case 'native':
        return this.balances.native(condition.chain, account.address)
      case 'erc20':
        return this.balances.erc20(condition.chain, condition.contract, account.address)
      case 'erc721':
        return this.balances.erc721(condition.chain, condition.contract, account.address)
      case 'spl':
        return this.balances.spl(condition.chain, condition.mint, account.address)
    }
  }
}
