import { openDB, type IDBPDatabase } from 'idb';

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  version: string;
  dependencies: string[];
  ttl: number;
  priority: 'high' | 'medium' | 'low';
}

export interface CacheOptions {
  ttl?: number;
  dependencies?: string[];
  version?: string;
  priority?: 'high' | 'medium' | 'low';
  skipMemory?: boolean;
  skipDB?: boolean;
}

class CacheManager {
  private static instance: CacheManager;
  private memoryCache = new Map<string, CacheEntry<any>>();
  private dbCache: IDBPDatabase | null = null;
  private readonly DB_NAME = 'TableDirectCache';
  private readonly DB_VERSION = 1;
  private readonly MEMORY_LIMIT = 100; // Maximum entries in memory
  private cleanupInterval: NodeJS.Timeout | null = null;

  private constructor() {
    this.initDB();
    this.startCleanupScheduler();
  }

  static getInstance(): CacheManager {
    if (!CacheManager.instance) {
      CacheManager.instance = new CacheManager();
    }
    return CacheManager.instance;
  }

  private async initDB(): Promise<void> {
    try {
      this.dbCache = await openDB(this.DB_NAME, this.DB_VERSION, {
        upgrade(db) {
          // Create object store for cache entries
          const store = db.createObjectStore('cache', { keyPath: 'key' });
          store.createIndex('timestamp', 'timestamp');
          store.createIndex('dependencies', 'dependencies', { multiEntry: true });
        },
      });
    } catch (error) {
      console.error('Failed to initialize IndexedDB cache:', error);
    }
  }

  private startCleanupScheduler(): void {
    // Clean up expired entries every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpired();
    }, 5 * 60 * 1000);
  }

  private async cleanupExpired(): Promise<void> {
    const now = Date.now();
    
    // Clean memory cache
    for (const [key, entry] of this.memoryCache) {
      if (!this.isValid(entry, now)) {
        this.memoryCache.delete(key);
      }
    }

    // Clean IndexedDB cache
    if (this.dbCache) {
      try {
        const tx = this.dbCache.transaction('cache', 'readwrite');
        const store = tx.objectStore('cache');
        const cursor = await store.openCursor();
        
        while (cursor) {
          const entry = cursor.value;
          if (!this.isValid(entry, now)) {
            await cursor.delete();
          }
          cursor.continue();
        }
        
        await tx.done;
      } catch (error) {
        console.error('Failed to cleanup IndexedDB cache:', error);
      }
    }
  }

  private isValid(entry: CacheEntry<any>, now: number = Date.now()): boolean {
    return now - entry.timestamp < entry.ttl;
  }

  private evictLRU(): void {
    if (this.memoryCache.size <= this.MEMORY_LIMIT) return;

    // Sort by timestamp and priority, evict oldest low-priority items first
    const entries = Array.from(this.memoryCache.entries())
      .sort(([, a], [, b]) => {
        const priorityWeight = { high: 3, medium: 2, low: 1 };
        const aPriority = priorityWeight[a.priority];
        const bPriority = priorityWeight[b.priority];
        
        if (aPriority !== bPriority) {
          return aPriority - bPriority; // Lower priority first
        }
        
        return a.timestamp - b.timestamp; // Older first
      });

    // Remove oldest 10% of entries
    const toRemove = Math.ceil(entries.length * 0.1);
    for (let i = 0; i < toRemove; i++) {
      this.memoryCache.delete(entries[i][0]);
    }
  }

  async get<T>(key: string): Promise<T | null> {
    // Try memory cache first (fastest)
    const memoryEntry = this.memoryCache.get(key);
    if (memoryEntry && this.isValid(memoryEntry)) {
      // Update access time for LRU
      memoryEntry.timestamp = Date.now();
      return memoryEntry.data;
    }

    // Try IndexedDB cache (persistent)
    if (this.dbCache) {
      try {
        const dbEntry = await this.dbCache.get('cache', key);
        if (dbEntry && this.isValid(dbEntry)) {
          // Promote to memory cache
          this.memoryCache.set(key, dbEntry);
          this.evictLRU();
          return dbEntry.data;
        }
      } catch (error) {
        console.error('Failed to read from IndexedDB cache:', error);
      }
    }

    return null;
  }

  async set<T>(
    key: string,
    data: T,
    options: CacheOptions = {}
  ): Promise<void> {
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      version: options.version || '1',
      dependencies: options.dependencies || [],
      ttl: options.ttl || 5 * 60 * 1000, // 5 minutes default
      priority: options.priority || 'medium'
    };

    // Set in memory cache unless skipped
    if (!options.skipMemory) {
      this.memoryCache.set(key, entry);
      this.evictLRU();
    }

    // Set in IndexedDB for persistence unless skipped
    if (!options.skipDB && this.dbCache) {
      try {
        await this.dbCache.put('cache', { ...entry, key });
      } catch (error) {
        console.error('Failed to write to IndexedDB cache:', error);
      }
    }
  }

  async invalidate(key: string): Promise<void> {
    // Remove from memory
    this.memoryCache.delete(key);

    // Remove from IndexedDB
    if (this.dbCache) {
      try {
        await this.dbCache.delete('cache', key);
      } catch (error) {
        console.error('Failed to delete from IndexedDB cache:', error);
      }
    }

    // Invalidate dependents
    await this.invalidateDependents(key);
  }

  async invalidateByTag(tag: string): Promise<void> {
    // Invalidate all entries with this dependency in memory
    const keysToInvalidate: string[] = [];
    for (const [key, entry] of this.memoryCache) {
      if (entry.dependencies.includes(tag)) {
        keysToInvalidate.push(key);
      }
    }

    // Remove from memory
    keysToInvalidate.forEach(key => this.memoryCache.delete(key));

    // Invalidate in IndexedDB
    if (this.dbCache) {
      try {
        const tx = this.dbCache.transaction('cache', 'readwrite');
        const store = tx.objectStore('cache');
        const index = store.index('dependencies');
        const cursor = await index.openCursor(tag);
        
        while (cursor) {
          await cursor.delete();
          cursor.continue();
        }
        
        await tx.done;
      } catch (error) {
        console.error('Failed to invalidate by tag in IndexedDB:', error);
      }
    }
  }

  private async invalidateDependents(tag: string): Promise<void> {
    await this.invalidateByTag(tag);
  }

  async clear(): Promise<void> {
    // Clear memory cache
    this.memoryCache.clear();

    // Clear IndexedDB cache
    if (this.dbCache) {
      try {
        await this.dbCache.clear('cache');
      } catch (error) {
        console.error('Failed to clear IndexedDB cache:', error);
      }
    }
  }

  getStats(): {
    memoryEntries: number;
    memorySize: string;
    dbAvailable: boolean;
  } {
    const memorySize = JSON.stringify(Array.from(this.memoryCache.values())).length;
    
    return {
      memoryEntries: this.memoryCache.size,
      memorySize: `${Math.round(memorySize / 1024)}KB`,
      dbAvailable: this.dbCache !== null
    };
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.memoryCache.clear();
    if (this.dbCache) {
      this.dbCache.close();
    }
  }
}

// Export singleton instance
export const cacheManager = CacheManager.getInstance();
export default cacheManager; 