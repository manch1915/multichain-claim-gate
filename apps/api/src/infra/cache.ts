/** Small in-memory TTL cache that also collapses concurrent loads of the same key. */
export class TtlCache<T> {
  private readonly values = new Map<string, { value: T; expires: number }>()
  private readonly inflight = new Map<string, Promise<T>>()

  constructor(private readonly ttlMs: number) {}

  async get(key: string, load: () => Promise<T>): Promise<T> {
    const hit = this.values.get(key)
    if (hit && hit.expires > Date.now()) return hit.value

    const pending = this.inflight.get(key)
    if (pending) return pending

    const promise = load()
      .then((value) => {
        this.values.set(key, { value, expires: Date.now() + this.ttlMs })
        return value
      })
      .finally(() => this.inflight.delete(key))
    this.inflight.set(key, promise)
    return promise
  }

  delete(key: string): void {
    this.values.delete(key)
  }
}
