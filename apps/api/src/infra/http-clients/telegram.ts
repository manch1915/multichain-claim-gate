import { AppError } from '../../domain/errors.js'
import type { TelegramInviter } from '../../ports/chains.js'

const INVITE_TTL_SECONDS = 15 * 60

/** One-time invite links via the Bot API. The bot must be an admin of the chat with invite rights. */
export class BotApiTelegramInviter implements TelegramInviter {
  constructor(
    private readonly token: string | undefined,
    private readonly chatId: string | undefined,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  get enabled(): boolean {
    return Boolean(this.token && this.chatId)
  }

  async createInvite(label: string): Promise<{ url: string; expiresAt: Date }> {
    if (!this.token || !this.chatId)
      throw new AppError('not_configured', 'Telegram is not configured')
    const expireDate = Math.floor(Date.now() / 1000) + INVITE_TTL_SECONDS
    const response = await this.fetchImpl(
      `https://api.telegram.org/bot${this.token}/createChatInviteLink`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.chatId,
          name: label.slice(0, 32),
          expire_date: expireDate,
          member_limit: 1,
        }),
        signal: AbortSignal.timeout(8_000),
      },
    )
    const body = (await response.json()) as { ok: boolean; result?: { invite_link: string } }
    if (!body.ok || !body.result) {
      throw new AppError('chain_error', 'Telegram did not create an invite link')
    }
    return { url: body.result.invite_link, expiresAt: new Date(expireDate * 1000) }
  }
}
