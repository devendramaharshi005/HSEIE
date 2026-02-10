import { Module, Logger } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const logger = new Logger('QueueModule');
        const USE_QUEUE = configService.get('USE_QUEUE', 'true') !== 'false';

        if (!USE_QUEUE) {
          logger.warn('Redis queue is DISABLED (USE_QUEUE=false)');
        }

        return {
          connection: {
            host: configService.get('REDIS_HOST', 'localhost'),
            port: configService.get('REDIS_PORT', 6379),
            db: 1, // Database 1 for queue (separate from cache which uses db: 0)
            maxRetriesPerRequest: null, // Required for BullMQ
            enableReadyCheck: false,
            connectTimeout: 10000, // 10 seconds
            lazyConnect: false,
            retryStrategy: (times: number) => {
              const delay = Math.min(times * 50, 2000);
              if (times > 3) {
                logger.error(`Redis queue connection failed after ${times} attempts`);
                return null;
              }
              logger.warn(`Redis queue connection retry attempt ${times}, delay: ${delay}ms`);
              return delay;
            },
            reconnectOnError: (err: Error) => {
              const targetError = 'READONLY';
              if (err.message.includes(targetError)) {
                logger.error('Redis queue is in readonly mode');
                return false;
              }
              return true;
            },
          },
          defaultJobOptions: {
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 1000,
            },
            removeOnComplete: {
              age: 3600, // Keep completed jobs for 1 hour
              count: 1000, // Keep last 1000 completed jobs
            },
            removeOnFail: {
              age: 86400, // Keep failed jobs for 24 hours
            },
          },
        };
      },
    }),
    BullModule.registerQueue({ name: 'meter-ingestion' }, { name: 'vehicle-ingestion' }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
