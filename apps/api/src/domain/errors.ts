export type ErrorCode =
  | 'bad_request'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'rate_limited'
  | 'not_configured'
  | 'chain_error'
  | 'nonce_invalid'
  | 'signature_invalid'
  | 'not_listed'
  | 'pending_publication'
  | 'already_claimed'
  | 'claims_paused'
  | 'transaction_mismatch'

const STATUS: Record<ErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  not_configured: 503,
  chain_error: 502,
  nonce_invalid: 400,
  signature_invalid: 401,
  not_listed: 404,
  pending_publication: 409,
  already_claimed: 409,
  claims_paused: 409,
  transaction_mismatch: 400,
}

/** Errors that are safe to show to the user. Anything else is logged and returned as a 500. */
export class AppError extends Error {
  readonly status: number

  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message)
    this.name = 'AppError'
    this.status = STATUS[code]
  }
}
