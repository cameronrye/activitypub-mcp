/**
 * A simple LRU (Least Recently Used) cache implementation.
 *
 * This cache automatically evicts the least recently used items when the
 * maximum size is reached. It also supports optional TTL (time-to-live)
 * for automatic expiration of entries.
 *
 * @typeParam K - The type of cache keys
 * @typeParam V - The type of cached values
 */
export class LRUCache<K, V> {
  private readonly cache = new Map<K, { value: V; timestamp: number }>();
  private readonly maxSize: number;
  private readonly ttl: number;

  /**
   * Creates a new LRU cache.
   *
   * @param options - Configuration options for the cache
   * @param options.maxSize - Maximum number of items to store (default: 1000)
   * @param options.ttl - Time-to-live in milliseconds (default: 0 = no expiration)
   */
  constructor(options: { maxSize?: number; ttl?: number } = {}) {
    this.maxSize = options.maxSize ?? 1000;
    this.ttl = options.ttl ?? 0;
  }

  /**
   * Gets a value from the cache.
   *
   * If the item exists and hasn't expired, it's moved to the end of the
   * cache (marking it as most recently used) and returned.
   *
   * @param key - The key to look up
   * @returns The cached value, or undefined if not found or expired
   */
  get(key: K): V | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      return undefined;
    }

    // Check if entry has expired
    if (this.ttl > 0 && Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return undefined;
    }

    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.value;
  }

  /**
   * Stores a value in the cache.
   *
   * If the cache is at capacity, the least recently used item is evicted
   * before adding the new item.
   *
   * @param key - The key to store under
   * @param value - The value to store
   */
  set(key: K, value: V): void {
    // If key exists, delete it first (to update its position)
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    // Evict oldest entries if at capacity
    while (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, { value, timestamp: Date.now() });
  }

  /**
   * Checks if a key exists in the cache and hasn't expired.
   *
   * @param key - The key to check
   * @returns True if the key exists and hasn't expired
   */
  has(key: K): boolean {
    const entry = this.cache.get(key);

    if (!entry) {
      return false;
    }

    // Check if entry has expired
    if (this.ttl > 0 && Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Removes a key from the cache.
   *
   * @param key - The key to remove
   * @returns True if the key was found and removed
   */
  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  /**
   * Removes all entries from the cache.
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Returns the current number of items in the cache.
   * Note: This may include expired items that haven't been cleaned up yet.
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Removes all expired entries from the cache.
   * Call this periodically if you want to proactively clean up expired entries.
   *
   * @returns The number of entries that were removed
   */
  prune(): number {
    if (this.ttl <= 0) {
      return 0;
    }

    const now = Date.now();
    let removed = 0;

    for (const [key, entry] of this.cache) {
      if (now - entry.timestamp > this.ttl) {
        this.cache.delete(key);
        removed++;
      }
    }

    return removed;
  }

  /**
   * Returns all keys in the cache (including potentially expired ones).
   */
  keys(): IterableIterator<K> {
    return this.cache.keys();
  }

  /**
   * Returns cache statistics.
   */
  stats(): { size: number; maxSize: number; ttl: number } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      ttl: this.ttl,
    };
  }
}
