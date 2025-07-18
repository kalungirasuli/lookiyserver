import Redis from 'ioredis';
import logger from './logger';

const redisClient = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  }
});

redisClient.on('error', (err) => {
  logger.error('Redis Client Error', {
    error: err instanceof Error ? err.message : 'Unknown error'
  });
});

redisClient.on('connect', () => {
  logger.info('Redis Client Connected');
});

// Cache helpers
export async function cacheSet(key: string, value: any, expireSeconds?: number) {
  try {
    const serialized = JSON.stringify(value);
    if (expireSeconds) {
      await redisClient.setex(key, expireSeconds, serialized);
    } else {
      await redisClient.set(key, serialized);
    }
  } catch (error) {
    logger.error('Redis Cache Set Error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      key
    });
  }
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const value = await redisClient.get(key);
    if (!value) return null;
    return JSON.parse(value) as T;
  } catch (error) {
    logger.error('Redis Cache Get Error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      key
    });
    return null;
  }
}

export async function cacheDelete(key: string) {
  try {
    await redisClient.del(key);
  } catch (error) {
    logger.error('Redis Cache Delete Error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      key
    });
  }
}

export async function cacheInvalidatePattern(pattern: string) {
  try {
    const keys = await redisClient.keys(pattern);
    if (keys.length > 0) {
      await redisClient.del(...keys);
    }
  } catch (error) {
    logger.error('Redis Cache Pattern Invalidation Error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      pattern
    });
  }
}

export default redisClient;