import { describe, expect, it } from 'vitest'
import { safeErrorMessage } from '../src/domain/safe-error.js'

describe('safeErrorMessage', () => {
  it('cuts URLs and API keys out of upstream errors', () => {
    const error = Object.assign(new Error('long details'), {
      shortMessage:
        'HTTP request failed. URL: https://api.pimlico.io/v2/84532/rpc?apikey=pim_secret',
    })
    const message = safeErrorMessage(error)
    expect(message).not.toContain('pim_secret')
    expect(message).toContain('[url]')
  })

  it('keeps only the first line and falls back for non-errors', () => {
    expect(safeErrorMessage(new Error('first\nsecond'))).toBe('first')
    expect(safeErrorMessage(42, 'fallback')).toBe('fallback')
  })
})
