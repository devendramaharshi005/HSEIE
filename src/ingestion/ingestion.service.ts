import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Repository } from 'typeorm';
import { Queue } from 'bullmq';
import { MeterTelemetryDto } from './dto/meter-telemetry.dto';
import { VehicleTelemetryDto } from './dto/vehicle-telemetry.dto';
import { MeterCurrent } from './entities/meter-current.entity';
import { MeterHistory } from './entities/meter-history.entity';
import { VehicleCurrent } from './entities/vehicle-current.entity';
import { VehicleHistory } from './entities/vehicle-history.entity';

@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);
  private readonly USE_QUEUE = process.env.USE_QUEUE !== 'false'; // Default: true

  constructor(
    @InjectRepository(MeterCurrent)
    private meterCurrentRepo: Repository<MeterCurrent>,
    @InjectRepository(MeterHistory)
    private meterHistoryRepo: Repository<MeterHistory>,
    @InjectRepository(VehicleCurrent)
    private vehicleCurrentRepo: Repository<VehicleCurrent>,
    @InjectRepository(VehicleHistory)
    private vehicleHistoryRepo: Repository<VehicleHistory>,
    @InjectQueue('meter-ingestion')
    private meterQueue: Queue,
    @InjectQueue('vehicle-ingestion')
    private vehicleQueue: Queue,
  ) {
    this.logger.log(`Ingestion mode: ${this.USE_QUEUE ? 'QUEUE (async)' : 'DIRECT (sync)'}`);
  }

  /**
   * Ingest meter telemetry data
   * - Queue mode: Add to Redis queue for batch processing (high throughput)
   * - Direct mode: Write immediately to database (low latency)
   */
  async ingestMeter(dto: MeterTelemetryDto) {
    const timestamp = new Date(dto.timestamp);

    if (this.USE_QUEUE) {
      // Queue mode: Add to Redis queue for async batch processing
      const job = await this.meterQueue.add(
        'ingest-meter',
        {
          meterId: dto.meterId,
          kwhConsumedAc: dto.kwhConsumedAc,
          voltage: dto.voltage,
          timestamp,
        },
        {
          priority: 1, // Normal priority
          // Use default removeOnComplete config from queue.module.ts
          // (keeps completed jobs for 1 hour or last 1000 jobs)
          removeOnFail: false,
        },
      );

      this.logger.debug(`✓ Meter ${dto.meterId} queued (job: ${job.id})`);

      return {
        success: true,
        meterId: dto.meterId,
        timestamp: timestamp.toISOString(),
        mode: 'queued',
        jobId: job.id,
      };
    } else {
      // Direct mode: Write immediately
      return this.ingestMeterDirect(dto, timestamp);
    }
  }

  /**
   * Ingest vehicle telemetry data
   * - Queue mode: Add to Redis queue for batch processing (high throughput)
   * - Direct mode: Write immediately to database (low latency)
   */
  async ingestVehicle(dto: VehicleTelemetryDto) {
    const timestamp = new Date(dto.timestamp);

    if (this.USE_QUEUE) {
      // Queue mode: Add to Redis queue for async batch processing
      const job = await this.vehicleQueue.add(
        'ingest-vehicle',
        {
          vehicleId: dto.vehicleId,
          soc: dto.soc,
          kwhDeliveredDc: dto.kwhDeliveredDc,
          batteryTemp: dto.batteryTemp,
          timestamp,
        },
        {
          priority: 1, // Normal priority
          // Use default removeOnComplete config from queue.module.ts
          // (keeps completed jobs for 1 hour or last 1000 jobs)
          removeOnFail: false,
        },
      );

      this.logger.debug(`✓ Vehicle ${dto.vehicleId} queued (job: ${job.id})`);

      return {
        success: true,
        vehicleId: dto.vehicleId,
        timestamp: timestamp.toISOString(),
        mode: 'queued',
        jobId: job.id,
      };
    } else {
      // Direct mode: Write immediately
      return this.ingestVehicleDirect(dto, timestamp);
    }
  }

  /**
   * Direct database write (used when queue is disabled)
   */
  private async ingestMeterDirect(dto: MeterTelemetryDto, timestamp: Date) {
    try {
      // Hot path: UPSERT current state
      await this.meterCurrentRepo
        .createQueryBuilder()
        .insert()
        .into(MeterCurrent)
        .values({
          meterId: dto.meterId,
          kwhConsumedAc: dto.kwhConsumedAc,
          voltage: dto.voltage,
          timestamp,
        })
        .orUpdate(['kwh_consumed_ac', 'voltage', 'timestamp', 'updated_at'], ['meter_id'])
        .execute();

      // Cold path: INSERT historical record
      await this.meterHistoryRepo.insert({
        meterId: dto.meterId,
        kwhConsumedAc: dto.kwhConsumedAc,
        voltage: dto.voltage,
        timestamp,
      });

      this.logger.debug(`✓ Meter ${dto.meterId} ingested directly`);

      return {
        success: true,
        meterId: dto.meterId,
        timestamp: timestamp.toISOString(),
        mode: 'direct',
      };
    } catch (error) {
      this.logger.error(`✗ Failed to ingest meter ${dto.meterId}:`, error.message);
      throw error;
    }
  }

  /**
   * Direct database write (used when queue is disabled)
   */
  private async ingestVehicleDirect(dto: VehicleTelemetryDto, timestamp: Date) {
    try {
      // Hot path: UPSERT current state
      await this.vehicleCurrentRepo
        .createQueryBuilder()
        .insert()
        .into(VehicleCurrent)
        .values({
          vehicleId: dto.vehicleId,
          soc: dto.soc,
          kwhDeliveredDc: dto.kwhDeliveredDc,
          batteryTemp: dto.batteryTemp,
          timestamp,
        })
        .orUpdate(
          ['soc', 'kwh_delivered_dc', 'battery_temp', 'timestamp', 'updated_at'],
          ['vehicle_id'],
        )
        .execute();

      // Cold path: INSERT historical record
      await this.vehicleHistoryRepo.insert({
        vehicleId: dto.vehicleId,
        soc: dto.soc,
        kwhDeliveredDc: dto.kwhDeliveredDc,
        batteryTemp: dto.batteryTemp,
        timestamp,
      });

      this.logger.debug(`✓ Vehicle ${dto.vehicleId} ingested directly`);

      return {
        success: true,
        vehicleId: dto.vehicleId,
        timestamp: timestamp.toISOString(),
        mode: 'direct',
      };
    } catch (error) {
      this.logger.error(`✗ Failed to ingest vehicle ${dto.vehicleId}:`, error.message);
      throw error;
    }
  }

  /**
   * Get current state of a meter
   */
  async getMeterCurrent(meterId: string) {
    return this.meterCurrentRepo.findOne({ where: { meterId } });
  }

  /**
   * Get current state of a vehicle
   */
  async getVehicleCurrent(vehicleId: string) {
    return this.vehicleCurrentRepo.findOne({ where: { vehicleId } });
  }

  /**
   * Get queue statistics
   */
  async getQueueStats() {
    const [meterCounts, vehicleCounts] = await Promise.all([
      this.meterQueue.getJobCounts(),
      this.vehicleQueue.getJobCounts(),
    ]);

    return {
      meterQueue: {
        waiting: meterCounts.waiting,
        active: meterCounts.active,
        completed: meterCounts.completed,
        failed: meterCounts.failed,
      },
      vehicleQueue: {
        waiting: vehicleCounts.waiting,
        active: vehicleCounts.active,
        completed: vehicleCounts.completed,
        failed: vehicleCounts.failed,
      },
    };
  }
}
