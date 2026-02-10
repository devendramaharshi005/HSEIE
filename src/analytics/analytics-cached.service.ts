import { Injectable, Logger, NotFoundException, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { Repository } from 'typeorm';
import { VehicleHistory } from '../ingestion/entities/vehicle-history.entity';
import { PerformanceResponseDto } from './dto/performance-response.dto';

@Injectable()
export class AnalyticsCachedService {
  private readonly logger = new Logger(AnalyticsCachedService.name);
  private readonly USE_CACHE = process.env.USE_CACHE !== 'false'; // Default: true

  constructor(
    @InjectRepository(VehicleHistory)
    private vehicleHistoryRepo: Repository<VehicleHistory>,
    @Inject(CACHE_MANAGER)
    private cacheManager: Cache,
  ) {
    this.logger.log(`Cache mode: ${this.USE_CACHE ? 'ENABLED' : 'DISABLED'}`);
  }

  /**
   * Get 24-hour performance summary for a vehicle (with caching)
   */
  async getPerformance(vehicleId: string): Promise<PerformanceResponseDto> {
    // Check cache first
    if (this.USE_CACHE) {
      const cacheKey = `performance:${vehicleId}`;
      const cached = await this.cacheManager.get<PerformanceResponseDto>(cacheKey);

      if (cached) {
        this.logger.debug(`✓ Cache HIT for ${vehicleId}`);
        return { ...cached, cached: true } as any;
      }

      this.logger.debug(`✗ Cache MISS for ${vehicleId} - querying database`);
    }

    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const result = await this.vehicleHistoryRepo.query(
      `
      SELECT 
        SUM(m.kwh_consumed_ac) as total_ac,
        SUM(v.kwh_delivered_dc) as total_dc,
        AVG(v.battery_temp) as avg_battery_temp,
        COUNT(v.id) as reading_count
      FROM vehicle_history v
      INNER JOIN meter_history m ON 
        v.vehicle_id = m.meter_id 
        AND ABS(EXTRACT(EPOCH FROM (v.timestamp - m.timestamp))) <= 30
      WHERE v.vehicle_id = $1 
        AND v.timestamp >= $2
      `,
      [vehicleId, last24Hours],
    );

    if (
      !result ||
      result.length === 0 ||
      !result[0].reading_count ||
      result[0].reading_count === '0'
    ) {
      throw new NotFoundException(`No data found for vehicle ${vehicleId} in the last 24 hours`);
    }

    const totalAc = parseFloat(result[0].total_ac) || 0;
    const totalDc = parseFloat(result[0].total_dc) || 0;
    const avgTemp = parseFloat(result[0].avg_battery_temp) || 0;
    const efficiency = totalAc > 0 ? (totalDc / totalAc) * 100 : 0;

    const response: PerformanceResponseDto = {
      vehicleId,
      period: '24h',
      totalEnergyConsumedAc: Math.round(totalAc * 100) / 100,
      totalEnergyDeliveredDc: Math.round(totalDc * 100) / 100,
      efficiencyRatio: Math.round(efficiency * 100) / 100,
      avgBatteryTemp: Math.round(avgTemp * 100) / 100,
    };

    // Cache the result
    if (this.USE_CACHE) {
      const cacheKey = `performance:${vehicleId}`;
      // Cache for 5 minutes (300 seconds) - matches default TTL from RedisModule
      await this.cacheManager.set(cacheKey, response, 300 * 1000);
      this.logger.debug(`✓ Cached result for ${vehicleId} (TTL: 5 minutes)`);
    }

    return response;
  }
}
