import { Module, Global, Logger } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { redisStore } from 'cache-manager-ioredis-yet';
import type { RedisOptions } from 'ioredis';

@Global()
@Module({
  imports: [
    CacheModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => {
        const logger = new Logger('RedisModule');
        const USE_CACHE = configService.get('USE_CACHE', 'true') !== 'false';

        if (!USE_CACHE) {
          logger.warn('Redis cache is DISABLED (USE_CACHE=false)');
          return {
            ttl: 300 * 1000,
            max: 1000,
          };
        }

        const redisConfig: RedisOptions = {
          host: configService.get('REDIS_HOST', 'localhost'),
          port: configService.get('REDIS_PORT', 6379),
          db: 0, // Database 0 for cache (separate from queue which uses db: 1)
          maxRetriesPerRequest: 3,
          enableReadyCheck: true,
          connectTimeout: 10000, // 10 seconds
          lazyConnect: false,
          retryStrategy: (times: number) => {
            const delay = Math.min(times * 50, 2000);
            if (times > 3) {
              logger.error(`Redis connection failed after ${times} attempts`);
              return null; // Stop retrying after 3 attempts
            }
            logger.warn(`Redis connection retry attempt ${times}, delay: ${delay}ms`);
            return delay;
          },
          reconnectOnError: (err: Error) => {
            const targetError = 'READONLY';
            if (err.message.includes(targetError)) {
              logger.error('Redis is in readonly mode');
              return false; // Don't reconnect
            }
            return true; // Reconnect on other errors
          },
        };

        try {
          const store = await redisStore(redisConfig);
          logger.log('✓ Redis cache store initialized');
          return {
            store,
            ttl: 300 * 1000, // 5 minutes default TTL (in milliseconds)
            max: 1000, // Maximum number of items in cache
          };
        } catch (error) {
          logger.error(`Failed to initialize Redis cache: ${error.message}`);
          logger.warn('Falling back to in-memory cache');
          return {
            ttl: 300 * 1000,
            max: 1000,
          };
        }
      },
    }),
  ],
  exports: [CacheModule],
})
export class RedisModule {}
