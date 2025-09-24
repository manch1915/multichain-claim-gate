/**
 * Error text that is safe to store or show. Upstream errors (viem, RPC providers) embed request
 * URLs, and the Pimlico URL carries the API key, so URLs are cut out and the text is shortened.
 */
export function safeErrorMessage(error: unknown, fallback = 'Request failed'): string {
  const raw =
    (error as { shortMessage?: unknown })?.shortMessage ??
    (error instanceof Error ? error.message : undefined)
  if (typeof raw !== 'string' || raw.trim() === '') return fallback
  const firstLine = raw.split('\n')[0] ?? ''
  return firstLine
    .replace(/https?:\/\/\S+/gi, '[url]')
    .replace(/apikey=\S+/gi, 'apikey=[redacted]')
    .slice(0, 200)
}
