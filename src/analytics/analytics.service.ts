import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VehicleHistory } from '../ingestion/entities/vehicle-history.entity';
import { PerformanceResponseDto } from './dto/performance-response.dto';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    @InjectRepository(VehicleHistory)
    private vehicleHistoryRepo: Repository<VehicleHistory>,
  ) { }

  /**
   * Get 24-hour performance summary for a vehicle
   * - Correlates meter (AC) and vehicle (DC) data within 30-second window
   * - Calculates efficiency ratio (DC/AC)
   * - Uses partition pruning and composite indexes to avoid full table scan
   */
  async getPerformance(vehicleId: string): Promise<PerformanceResponseDto> {
    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);

    this.logger.debug(`Calculating performance for ${vehicleId} (last 24h)`);

    try {
      // Optimized query with:
      // 1. Partition pruning (only scans relevant day partitions)
      // 2. Composite index on (vehicle_id, timestamp)
      // 3. Time-window join (±30 seconds) for clock drift tolerance
      const result = await this.vehicleHistoryRepo.query(
        `
        SELECT 
          SUM(m.kwh_consumed_ac) as total_ac,
          SUM(v.kwh_delivered_dc) as total_dc,
          AVG(v.battery_temp) as avg_battery_temp,
          COUNT(v.id) as reading_count
        FROM vehicle_history v
        INNER JOIN meter_history m ON 
          (v.vehicle_id = m.meter_id OR m.meter_id = REPLACE(v.vehicle_id, 'VEHICLE_', 'METER_'))
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
      const avgBatteryTemp = parseFloat(result[0].avg_battery_temp) || 0;

      const response: PerformanceResponseDto = {
        vehicleId,
        period: '24h',
        totalEnergyConsumedAc: Math.round(totalAc * 100) / 100,
        totalEnergyDeliveredDc: Math.round(totalDc * 100) / 100,
        efficiencyRatio: totalAc > 0 ? Math.round((totalDc / totalAc) * 10000) / 100 : 0,
        avgBatteryTemp: Math.round(avgBatteryTemp * 100) / 100,
      };

      this.logger.debug(`Performance calculated: ${JSON.stringify(response)}`);

      return response;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Failed to calculate performance for ${vehicleId}:`, error.message);
      throw error;
    }
  }
}
