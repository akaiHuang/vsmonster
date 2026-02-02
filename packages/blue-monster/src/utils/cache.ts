/**
 * LRU Cache 實現
 * 用於優化歷史搜尋和 token 計算的效能
 */

export class LRUCache<K, V> {
  private cache = new Map<K, V>();
  private readonly maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // 移到最後（最近使用）
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // 刪除最舊的項目
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, value);
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }

  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

// 全域快取實例
const searchCache = new LRUCache<string, string[]>(50);
const tokenCache = new LRUCache<string, number>(200);

/**
 * 取得快取的 token 計數
 */
export function getCachedTokenCount(text: string): number | undefined {
  return tokenCache.get(text);
}

/**
 * 設定 token 計數快取
 */
export function setCachedTokenCount(text: string, count: number): void {
  tokenCache.set(text, count);
}

/**
 * 取得快取的搜尋結果
 */
export function getCachedSearchResults(query: string): string[] | undefined {
  return searchCache.get(query);
}

/**
 * 設定搜尋結果快取
 */
export function setCachedSearchResults(query: string, results: string[]): void {
  searchCache.set(query, results);
}

/**
 * 清除搜尋快取（當歷史變更時呼叫）
 */
export function invalidateSearchCache(): void {
  searchCache.clear();
}

/**
 * 清除 token 快取
 */
export function invalidateTokenCache(): void {
  tokenCache.clear();
}
