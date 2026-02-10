import { Module, Global } from '@nestjs/common';
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
        const redisConfig: RedisOptions = {
          host: configService.get('REDIS_HOST', 'localhost'),
          port: configService.get('REDIS_PORT', 6379),
          db: 0,
          maxRetriesPerRequest: 3,
          enableReadyCheck: true,
          retryStrategy: (times: number) => {
            const delay = Math.min(times * 50, 2000);
            return delay;
          },
        };

        return {
          store: await redisStore(redisConfig),
          ttl: 300 * 1000, // 5 minutes default TTL (in milliseconds)
          max: 1000, // Maximum number of items in cache
        };
      },
    }),
  ],
  exports: [CacheModule],
})
export class RedisModule {}
