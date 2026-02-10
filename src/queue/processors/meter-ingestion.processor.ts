import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, Inject } from '@nestjs/common';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { Repository } from 'typeorm';
import { MeterCurrent } from '../../ingestion/entities/meter-current.entity';
import { MeterHistory } from '../../ingestion/entities/meter-history.entity';

interface MeterJobData {
  meterId: string;
  kwhConsumedAc: number;
  voltage: number;
  timestamp: Date;
}

@Processor('meter-ingestion', {
  concurrency: 10, // Process 10 jobs in parallel
})
export class MeterIngestionProcessor extends WorkerHost {
  private readonly logger = new Logger(MeterIngestionProcessor.name);
  private readonly USE_CACHE = process.env.USE_CACHE !== 'false'; // Default: true

  constructor(
    @InjectRepository(MeterCurrent)
    private meterCurrentRepo: Repository<MeterCurrent>,
    @InjectRepository(MeterHistory)
    private meterHistoryRepo: Repository<MeterHistory>,
    @Inject(CACHE_MANAGER)
    private cacheManager: Cache,
  ) {
    super();
  }

  async process(job: Job<MeterJobData>): Promise<any> {
    const { meterId, kwhConsumedAc, voltage, timestamp } = job.data;

    try {
      // Batch write: Use UPSERT for current, INSERT for history
      await Promise.all([
        // Hot storage (current state)
        this.meterCurrentRepo
          .createQueryBuilder()
          .insert()
          .into(MeterCurrent)
          .values({
            meterId,
            kwhConsumedAc,
            voltage,
            timestamp,
          })
          .orUpdate(['kwh_consumed_ac', 'voltage', 'timestamp'], ['meter_id'])
          .execute(),

        // Cold storage (historical audit)
        this.meterHistoryRepo
          .createQueryBuilder()
          .insert()
          .into(MeterHistory)
          .values({
            meterId,
            kwhConsumedAc,
            voltage,
            timestamp,
          })
          .execute(),
      ]);

      // Invalidate cache for this meter after successful write
      if (this.USE_CACHE) {
        const cacheKey = `meter:current:${meterId}`;
        await this.cacheManager.del(cacheKey).catch((err) => {
          this.logger.warn(`Failed to invalidate cache for ${meterId}: ${err.message}`);
        });
      }

      return { success: true, meterId, timestamp };
    } catch (error) {
      this.logger.error(`Failed to process meter job ${job.id}`, error);
      throw error; // Will trigger retry
    }
  }
}
