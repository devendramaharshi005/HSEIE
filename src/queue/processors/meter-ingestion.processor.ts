import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
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

  constructor(
    @InjectRepository(MeterCurrent)
    private meterCurrentRepo: Repository<MeterCurrent>,
    @InjectRepository(MeterHistory)
    private meterHistoryRepo: Repository<MeterHistory>,
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

      return { success: true, meterId, timestamp };
    } catch (error) {
      this.logger.error(`Failed to process meter job ${job.id}`, error);
      throw error; // Will trigger retry
    }
  }
}
