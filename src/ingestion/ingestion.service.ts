import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
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
  private readonly USE_QUEUE: boolean;
  private readonly USE_CACHE: boolean;

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
    @Inject(CACHE_MANAGER)
    private cacheManager: Cache,
    private configService: ConfigService,
  ) {
    this.USE_QUEUE = this.configService.get('USE_QUEUE', 'true') !== 'false';
    this.USE_CACHE = this.configService.get('USE_CACHE', 'true') !== 'false';

    this.logger.log(`Ingestion mode: ${this.USE_QUEUE ? 'QUEUE (async)' : 'DIRECT (sync)'}`);
    this.logger.log(`Cache mode: ${this.USE_CACHE ? 'ENABLED' : 'DISABLED'}`);
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

      // Invalidate cache for this meter
      if (this.USE_CACHE) {
        const cacheKey = `meter:current:${dto.meterId}`;
        await this.cacheManager.del(cacheKey);
        this.logger.debug(`✓ Invalidated cache for meter ${dto.meterId}`);
      }

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

      // Invalidate cache for this vehicle (both current state and performance analytics)
      if (this.USE_CACHE) {
        const currentCacheKey = `vehicle:current:${dto.vehicleId}`;
        const performanceCacheKey = `performance:${dto.vehicleId}`;
        await Promise.all([
          this.cacheManager.del(currentCacheKey),
          this.cacheManager.del(performanceCacheKey),
        ]);
        this.logger.debug(`✓ Invalidated cache for vehicle ${dto.vehicleId}`);
      }

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
   * Get current state of a meter (with caching)
   */
  async getMeterCurrent(meterId: string) {
    // Check cache first
    if (this.USE_CACHE) {
      const cacheKey = `meter:current:${meterId}`;
      const cached = await this.cacheManager.get<MeterCurrent>(cacheKey);
      if (cached) {
        this.logger.debug(`✓ Cache HIT for meter ${meterId}`);
        return cached;
      }
      this.logger.debug(`✗ Cache MISS for meter ${meterId}`);
    }

    // Query database
    const result = await this.meterCurrentRepo.findOne({ where: { meterId } });

    // Cache the result
    if (this.USE_CACHE && result) {
      const cacheKey = `meter:current:${meterId}`;
      // Cache for 1 minute (realtime data changes frequently)
      await this.cacheManager.set(cacheKey, result, 60 * 1000);
      this.logger.debug(`✓ Cached meter current state for ${meterId}`);
    }

    return result;
  }

  /**
   * Get current state of a vehicle (with caching)
   */
  async getVehicleCurrent(vehicleId: string) {
    // Check cache first
    if (this.USE_CACHE) {
      const cacheKey = `vehicle:current:${vehicleId}`;
      const cached = await this.cacheManager.get<VehicleCurrent>(cacheKey);
      if (cached) {
        this.logger.debug(`✓ Cache HIT for vehicle ${vehicleId}`);
        return cached;
      }
      this.logger.debug(`✗ Cache MISS for vehicle ${vehicleId}`);
    }

    // Query database
    const result = await this.vehicleCurrentRepo.findOne({ where: { vehicleId } });

    // Cache the result
    if (this.USE_CACHE && result) {
      const cacheKey = `vehicle:current:${vehicleId}`;
      // Cache for 1 minute (realtime data changes frequently)
      await this.cacheManager.set(cacheKey, result, 60 * 1000);
      this.logger.debug(`✓ Cached vehicle current state for ${vehicleId}`);
    }

    return result;
  }

  /**
   * Get queue statistics for both meter and vehicle queues
   */
  async getQueueStats() {
    if (!this.USE_QUEUE) {
      return {
        meterQueue: {
          waiting: 0,
          active: 0,
          completed: 0,
          failed: 0,
          message: 'Queue mode is disabled (USE_QUEUE=false)',
        },
        vehicleQueue: {
          waiting: 0,
          active: 0,
          completed: 0,
          failed: 0,
          message: 'Queue mode is disabled (USE_QUEUE=false)',
        },
      };
    }

    try {
      const [meterStats, vehicleStats] = await Promise.all([
        this.meterQueue.getJobCounts(),
        this.vehicleQueue.getJobCounts(),
      ]);

      // Map BullMQ stats (v5 might use 'wait' or 'waiting')
      // Providing fallbacks for robustness
      const mapStats = (stats: any) => ({
        waiting: stats.waiting || stats.wait || 0,
        active: stats.active || 0,
        completed: stats.completed || 0,
        failed: stats.failed || 0,
      });

      return {
        meterQueue: mapStats(meterStats),
        vehicleQueue: mapStats(vehicleStats),
      };
    } catch (error) {
      this.logger.error('Failed to get queue stats:', error);
      throw error;
    }
  }
}
