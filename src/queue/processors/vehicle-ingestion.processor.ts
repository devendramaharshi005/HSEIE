import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VehicleCurrent } from '../../ingestion/entities/vehicle-current.entity';
import { VehicleHistory } from '../../ingestion/entities/vehicle-history.entity';

interface VehicleJobData {
  vehicleId: string;
  soc: number;
  kwhDeliveredDc: number;
  batteryTemp: number;
  timestamp: Date;
}

@Processor('vehicle-ingestion', {
  concurrency: 10, // Process 10 jobs in parallel
})
export class VehicleIngestionProcessor extends WorkerHost {
  private readonly logger = new Logger(VehicleIngestionProcessor.name);

  constructor(
    @InjectRepository(VehicleCurrent)
    private vehicleCurrentRepo: Repository<VehicleCurrent>,
    @InjectRepository(VehicleHistory)
    private vehicleHistoryRepo: Repository<VehicleHistory>,
  ) {
    super();
  }

  async process(job: Job<VehicleJobData>): Promise<any> {
    const { vehicleId, soc, kwhDeliveredDc, batteryTemp, timestamp } = job.data;

    try {
      // Batch write: Use UPSERT for current, INSERT for history
      await Promise.all([
        // Hot storage (current state)
        this.vehicleCurrentRepo
          .createQueryBuilder()
          .insert()
          .into(VehicleCurrent)
          .values({
            vehicleId,
            soc,
            kwhDeliveredDc,
            batteryTemp,
            timestamp,
          })
          .orUpdate(['soc', 'kwh_delivered_dc', 'battery_temp', 'timestamp'], ['vehicle_id'])
          .execute(),

        // Cold storage (historical audit)
        this.vehicleHistoryRepo
          .createQueryBuilder()
          .insert()
          .into(VehicleHistory)
          .values({
            vehicleId,
            soc,
            kwhDeliveredDc,
            batteryTemp,
            timestamp,
          })
          .execute(),
      ]);

      return { success: true, vehicleId, timestamp };
    } catch (error) {
      this.logger.error(`Failed to process vehicle job ${job.id}`, error);
      throw error; // Will trigger retry
    }
  }
}
