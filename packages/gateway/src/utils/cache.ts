/**
 * Simple in-memory TTL cache.
 *
 * Used to avoid redundant computation / serialisation on hot paths such as
 * `getAllTasks()` and `getTask()` which are polled frequently by the test
 * page, Mission Control, and REST API consumers.
 */
export class SimpleCache<T> {
  private cache = new Map<string, { value: T; expiry: number }>();

  constructor(private ttlMs: number = 5000) {}

  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T): void {
    this.cache.set(key, { value, expiry: Date.now() + this.ttlMs });
  }

  /** Remove a single key, or clear the entire cache when called without args. */
  invalidate(key?: string): void {
    if (key) this.cache.delete(key);
    else this.cache.clear();
  }

  /** Return the number of (possibly expired) entries for diagnostics. */
  get size(): number {
    return this.cache.size;
  }
}
