/**
 * Redis Cache Service
 *
 * Simple TTL-based cache for signal data.
 * Graceful degradation if Redis unavailable.
 */

import { Redis } from 'ioredis';
import type { CacheKey } from '../signals/types.js';

// Cache TTL in seconds
export const CACHE_TTL = {
  SIGNALS: 120, // 2 minutes for combined signals
  LIQUIDITY: 180, // 3 minutes for liquidity data
  RISK: 300, // 5 minutes for risk data
  WHALE: 60, // 1 minute for whale transfers
};

// In-memory fallback if Redis unavailable
const memoryCache = new Map<string, { data: string; expires: number }>();

class CacheService {
  private redis: Redis | null = null;
  private isConnected = false;
  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

    try {
      this.redis = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        retryStrategy: (times: number): number | null => {
          if (times > 3) {
            console.warn('[Cache] Redis connection failed, using memory cache');
            return null; // Stop retrying
          }
          return Math.min(times * 200, 1000);
        },
        lazyConnect: true,
      });

      this.redis.on('connect', () => {
        this.isConnected = true;
        console.log('[Cache] Redis connected');
      });

      this.redis.on('error', (err: Error) => {
        if (this.isConnected) {
          console.warn('[Cache] Redis error:', err.message);
        }
        this.isConnected = false;
      });

      this.redis.on('close', () => {
        this.isConnected = false;
      });

      // Attempt connection
      await this.redis.connect().catch(() => {
        console.log('[Cache] Redis unavailable, using memory cache');
      });
    } catch (err) {
      console.warn('[Cache] Redis init failed, using memory cache');
      this.redis = null;
    }

    // Start cleanup interval for memory cache
    this.startCleanupInterval();
  }

  async disconnect(): Promise<void> {
    if (this.redis) {
      try {
        await this.redis.quit();
        this.redis = null;
        this.isConnected = false;
        console.log('[Cache] Redis disconnected');
      } catch {
        // Ignore disconnect errors
      }
    }
  }

  async get<T>(key: CacheKey | string): Promise<T | null> {
    try {
      // Try Redis first
      if (this.redis && this.isConnected) {
        const data = await this.redis.get(key);
        if (data) {
          return JSON.parse(data) as T;
        }
      }

      // Fallback to memory cache
      const cached = memoryCache.get(key);
      if (cached && cached.expires > Date.now()) {
        return JSON.parse(cached.data) as T;
      }

      // Expired - clean up
      if (cached) {
        memoryCache.delete(key);
      }

      return null;
    } catch (err) {
      console.warn('[Cache] Get error:', err);
      return null;
    }
  }

  async set(key: CacheKey | string, value: unknown, ttlSeconds: number = CACHE_TTL.SIGNALS): Promise<boolean> {
    const data = JSON.stringify(value);

    try {
      // Try Redis first
      if (this.redis && this.isConnected) {
        await this.redis.setex(key, ttlSeconds, data);
        return true;
      }

      // Fallback to memory cache
      memoryCache.set(key, {
        data,
        expires: Date.now() + ttlSeconds * 1000,
      });
      return true;
    } catch (err) {
      console.warn('[Cache] Set error:', err);

      // Still try memory cache
      memoryCache.set(key, {
        data,
        expires: Date.now() + ttlSeconds * 1000,
      });
      return true;
    }
  }

  async delete(key: CacheKey | string): Promise<boolean> {
    try {
      if (this.redis && this.isConnected) {
        await this.redis.del(key);
      }
      memoryCache.delete(key);
      return true;
    } catch (err) {
      console.warn('[Cache] Delete error:', err);
      memoryCache.delete(key);
      return true;
    }
  }

  // Get remaining TTL for a key
  async ttl(key: CacheKey | string): Promise<number> {
    try {
      if (this.redis && this.isConnected) {
        const ttl = await this.redis.ttl(key);
        return ttl > 0 ? ttl : 0;
      }

      // Memory cache TTL
      const cached = memoryCache.get(key);
      if (cached) {
        const remaining = Math.floor((cached.expires - Date.now()) / 1000);
        return remaining > 0 ? remaining : 0;
      }

      return 0;
    } catch {
      return 0;
    }
  }

  // Health check
  async ping(): Promise<boolean> {
    try {
      if (this.redis && this.isConnected) {
        const result = await this.redis.ping();
        return result === 'PONG';
      }
      return false;
    } catch {
      return false;
    }
  }

  // Cleanup memory cache periodically
  private startCleanupInterval(intervalMs = 60000) {
    setInterval(() => {
      const now = Date.now();
      for (const [key, value] of memoryCache.entries()) {
        if (value.expires < now) {
          memoryCache.delete(key);
        }
      }
    }, intervalMs);
  }
}

// Singleton instance
export const cache = new CacheService();

export default cache;
