import Redis from 'ioredis';
import crypto from 'crypto';
import type { EnhancedExtractionResult } from '../types/extraction';

/**
 * 🗄️ Redis Cache Service
 * 
 * Caches extraction results to:
 * - Reduce API costs (95%+ savings on repeat requests)
 * - Improve response times (50ms vs 5s)
 * - Handle high traffic efficiently
 */
export class CacheService {
  private redis: Redis | null = null;
  private enabled: boolean = false;
  private readonly TTL = 3600; // 1 hour default cache time
  private readonly KEY_PREFIX = 'ai-fashion:extract:';

  constructor() {
    this.initializeRedis();
  }

  private initializeRedis(): void {
    try {
      const redisUrl = process.env.REDIS_URL;
      const redisHost = process.env.REDIS_HOST || 'localhost';
      const redisPort = parseInt(process.env.REDIS_PORT || '6379');
      const redisPassword = process.env.REDIS_PASSWORD;
      const useTls = process.env.REDIS_TLS === 'true' || (redisUrl?.startsWith('rediss://') ?? false);

      const commonOptions = {
        maxRetriesPerRequest: null,
        enableReadyCheck: true,
        lazyConnect: true,
        connectTimeout: 10000,
        keepAlive: 30000,
        retryStrategy: (times: number) => Math.min(times * 500, 5000),
        reconnectOnError: (error: Error) => {
          const message = error.message?.toLowerCase() || '';
          if (
            message.includes('econnreset') ||
            message.includes('connection is closed') ||
            message.includes('socket closed unexpectedly')
          ) {
            return true;
          }
          return false;
        }
      };

      if (redisUrl) {
        // Use Redis URL (for cloud deployments)
        this.redis = new Redis(redisUrl, {
          ...commonOptions,
          ...(useTls ? { tls: {} } : {})
        });
      } else if (process.env.ENABLE_REDIS === 'true') {
        // Use host/port configuration
        this.redis = new Redis({
          host: redisHost,
          port: redisPort,
          password: redisPassword,
          ...commonOptions,
          ...(useTls ? { tls: {} } : {})
        });
      } else {
        console.log('ℹ️  Redis caching disabled (set ENABLE_REDIS=true to enable)');
        return;
      }

      // Connect to Redis
      this.redis.connect().then(() => {
        // status transitions handled in event listeners
      }).catch((error) => {
        console.warn('⚠️  Redis connection failed, caching disabled:', error.message);
        this.enabled = false;
        this.redis = null;
      });

      this.redis.on('ready', () => {
        const wasDisabled = !this.enabled;
        this.enabled = true;
        if (wasDisabled) {
          console.log('✅ Redis cache connected successfully');
          console.log(`📊 Cache TTL: ${this.TTL}s (${Math.round(this.TTL / 60)} minutes)`);
        }
      });

      this.redis.on('close', () => {
        this.enabled = false;
      });

      this.redis.on('end', () => {
        this.enabled = false;
        console.warn('⚠️  Redis connection ended');
      });

      // Handle Redis errors
      this.redis.on('error', (error) => {
        console.error('❌ Redis error:', error.message);
      });

      this.redis.on('reconnecting', () => {
        console.log('🔄 Redis reconnecting...');
      });

    } catch (error) {
      console.warn('⚠️  Redis initialization failed, caching disabled:', error instanceof Error ? error.message : 'Unknown error');
      this.enabled = false;
      this.redis = null;
    }
  }

  /**
   * Generate cache key from image and schema
   */
  private generateCacheKey(image: string, schema: any[], categoryName?: string): string {
    // Create hash of image (using first 1000 chars to save computation)
    const imageHash = crypto
      .createHash('sha256')
      .update(image.substring(0, 1000))
      .digest('hex')
      .substring(0, 16);

    // Create hash of schema
    const schemaHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(schema))
      .digest('hex')
      .substring(0, 16);

    // Create hash of category
    const categoryHash = categoryName 
      ? crypto.createHash('sha256').update(categoryName).digest('hex').substring(0, 8)
      : 'default';

    return `${this.KEY_PREFIX}${imageHash}:${schemaHash}:${categoryHash}`;
  }

  /**
   * Get cached extraction result
   */
  async get(
    image: string, 
    schema: any[], 
    categoryName?: string
  ): Promise<EnhancedExtractionResult | null> {
    if (!this.enabled || !this.redis) {
      return null;
    }

    try {
      const cacheKey = this.generateCacheKey(image, schema, categoryName);
      const cached = await this.redis.get(cacheKey);

      if (cached) {
        console.log('✅ Cache HIT:', cacheKey);
        const result = JSON.parse(cached) as EnhancedExtractionResult;
        
        // Add cache metadata
        return {
          ...result,
          cached: true,
          cacheKey
        } as any;
      }

      console.log('❌ Cache MISS:', cacheKey);
      return null;
    } catch (error) {
      console.error('Cache get error:', error);
      return null;
    }
  }

  /**
   * Store extraction result in cache
   */
  async set(
    image: string, 
    schema: any[], 
    result: EnhancedExtractionResult,
    categoryName?: string,
    ttl?: number
  ): Promise<void> {
    if (!this.enabled || !this.redis) {
      return;
    }

    try {
      const cacheKey = this.generateCacheKey(image, schema, categoryName);
      const cacheTTL = ttl || this.TTL;

      await this.redis.setex(
        cacheKey,
        cacheTTL,
        JSON.stringify(result)
      );

      console.log(`💾 Cached result: ${cacheKey} (TTL: ${cacheTTL}s)`);
    } catch (error) {
      console.error('Cache set error:', error);
    }
  }

  /**
   * Invalidate cache for specific image/schema combination
   */
  async invalidate(image: string, schema: any[], categoryName?: string): Promise<void> {
    if (!this.enabled || !this.redis) {
      return;
    }

    try {
      const cacheKey = this.generateCacheKey(image, schema, categoryName);
      await this.redis.del(cacheKey);
      console.log(`🗑️  Invalidated cache: ${cacheKey}`);
    } catch (error) {
      console.error('Cache invalidation error:', error);
    }
  }

  /**
   * Clear all extraction caches
   */
  async clearAll(): Promise<void> {
    if (!this.enabled || !this.redis) {
      return;
    }

    try {
      const keys = await this.redis.keys(`${this.KEY_PREFIX}*`);
      if (keys.length > 0) {
        await this.redis.del(...keys);
        console.log(`🗑️  Cleared ${keys.length} cache entries`);
      }
    } catch (error) {
      console.error('Cache clear error:', error);
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    enabled: boolean;
    connected: boolean;
    totalKeys: number;
    memoryUsage?: string;
    hitRate?: number;
  }> {
    if (!this.enabled || !this.redis) {
      return {
        enabled: false,
        connected: false,
        totalKeys: 0
      };
    }

    try {
      const keys = await this.redis.keys(`${this.KEY_PREFIX}*`);
      const info = await this.redis.info('memory');
      
      // Parse memory usage from info
      const memoryMatch = info.match(/used_memory_human:(.+)/);
      const memoryUsage = memoryMatch ? memoryMatch[1].trim() : 'unknown';

      return {
        enabled: true,
        connected: this.redis.status === 'ready',
        totalKeys: keys.length,
        memoryUsage
      };
    } catch (error) {
      console.error('Cache stats error:', error);
      return {
        enabled: this.enabled,
        connected: false,
        totalKeys: 0
      };
    }
  }

  /**
   * Check if cache is healthy
   */
  async isHealthy(): Promise<boolean> {
    if (!this.enabled || !this.redis) {
      return false;
    }

    try {
      await this.redis.ping();
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Close Redis connection
   */
  async disconnect(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
      console.log('👋 Redis disconnected');
    }
  }
}

// Export singleton instance
export const cacheService = new CacheService();
