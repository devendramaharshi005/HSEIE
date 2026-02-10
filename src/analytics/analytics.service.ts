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
  ) {}

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

  /**
   * Get vehicle history readings for a time range
   */
  async getVehicleHistory(vehicleId: string, startDate: Date, endDate: Date) {
    return this.vehicleHistoryRepo
      .createQueryBuilder('vh')
      .where('vh.vehicle_id = :vehicleId', { vehicleId })
      .andWhere('vh.timestamp >= :startDate', { startDate })
      .andWhere('vh.timestamp <= :endDate', { endDate })
      .orderBy('vh.timestamp', 'DESC')
      .limit(1000) // Prevent excessive data transfer
      .getMany();
  }

  /**
   * Get statistics for all vehicles
   */
  async getAllVehiclesStats() {
    const result = await this.vehicleHistoryRepo.query(`
      SELECT 
        COUNT(DISTINCT vehicle_id) as total_vehicles,
        AVG(soc) as avg_soc,
        AVG(battery_temp) as avg_temp,
        MIN(timestamp) as oldest_reading,
        MAX(timestamp) as latest_reading
      FROM vehicle_history
      WHERE timestamp >= NOW() - INTERVAL '24 hours'
    `);

    return {
      totalVehicles: parseInt(result[0].total_vehicles) || 0,
      avgSoc: Math.round(parseFloat(result[0].avg_soc) * 100) / 100 || 0,
      avgTemp: Math.round(parseFloat(result[0].avg_temp) * 100) / 100 || 0,
      oldestReading: result[0].oldest_reading,
      latestReading: result[0].latest_reading,
    };
  }

  /**
   * DEBUG: Check data availability for a vehicle
   */
  async debugVehicleData(vehicleId: string) {
    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Check vehicle_history
    const vehicleData = await this.vehicleHistoryRepo.query(
      `
      SELECT 
        COUNT(*) as total_records,
        MIN(timestamp) as oldest,
        MAX(timestamp) as newest,
        COUNT(*) FILTER (WHERE timestamp >= $2) as records_last_24h
      FROM vehicle_history
      WHERE vehicle_id = $1
    `,
      [vehicleId, last24Hours],
    );

    // Check meter_history
    const meterData = await this.vehicleHistoryRepo.query(
      `
      SELECT 
        COUNT(*) as total_records,
        MIN(timestamp) as oldest,
        MAX(timestamp) as newest,
        COUNT(*) FILTER (WHERE timestamp >= $2) as records_last_24h
      FROM meter_history
      WHERE meter_id = $1
    `,
      [vehicleId, last24Hours],
    );

    // Check if JOIN would work
    const joinTest = await this.vehicleHistoryRepo.query(
      `
      SELECT 
        v.vehicle_id,
        v.timestamp as vehicle_time,
        m.meter_id,
        m.timestamp as meter_time,
        ABS(EXTRACT(EPOCH FROM (v.timestamp - m.timestamp))) as time_diff_seconds
      FROM vehicle_history v
      INNER JOIN meter_history m ON 
        v.vehicle_id = m.meter_id 
        AND ABS(EXTRACT(EPOCH FROM (v.timestamp - m.timestamp))) <= 30
      WHERE v.vehicle_id = $1
        AND v.timestamp >= $2
      LIMIT 5
    `,
      [vehicleId, last24Hours],
    );

    // Get sample records
    const vehicleSamples = await this.vehicleHistoryRepo.query(
      `
      SELECT vehicle_id, timestamp, soc, kwh_delivered_dc
      FROM vehicle_history
      WHERE vehicle_id = $1
      ORDER BY timestamp DESC
      LIMIT 5
    `,
      [vehicleId],
    );

    const meterSamples = await this.vehicleHistoryRepo.query(
      `
      SELECT meter_id, timestamp, kwh_consumed_ac
      FROM meter_history
      WHERE meter_id = $1
      ORDER BY timestamp DESC
      LIMIT 5
    `,
      [vehicleId],
    );

    return {
      vehicleId,
      last24HoursStart: last24Hours.toISOString(),
      now: new Date().toISOString(),
      vehicleHistory: {
        totalRecords: parseInt(vehicleData[0].total_records),
        recordsLast24h: parseInt(vehicleData[0].records_last_24h),
        oldest: vehicleData[0].oldest,
        newest: vehicleData[0].newest,
        samples: vehicleSamples,
      },
      meterHistory: {
        totalRecords: parseInt(meterData[0].total_records),
        recordsLast24h: parseInt(meterData[0].records_last_24h),
        oldest: meterData[0].oldest,
        newest: meterData[0].newest,
        samples: meterSamples,
      },
      joinResults: {
        matchedRecords: joinTest.length,
        samples: joinTest,
      },
      diagnosis:
        joinTest.length === 0
          ? '❌ No matching records found in JOIN. Check if meter_id matches vehicle_id and timestamps are within 30 seconds.'
          : `✅ Found ${joinTest.length} matching records. Analytics should work.`,
    };
  }

  /**
   * DEBUG: Check total meter records in database
   */
  async debugAllMeterData() {
    const totalCount = await this.vehicleHistoryRepo.query(`
      SELECT COUNT(*) as total FROM meter_history
    `);

    const byMeterId = await this.vehicleHistoryRepo.query(`
      SELECT meter_id, COUNT(*) as count
      FROM meter_history
      GROUP BY meter_id
      ORDER BY count DESC
      LIMIT 10
    `);

    const recent = await this.vehicleHistoryRepo.query(`
      SELECT meter_id, timestamp, kwh_consumed_ac
      FROM meter_history
      ORDER BY timestamp DESC
      LIMIT 10
    `);

    return {
      totalMeterRecords: parseInt(totalCount[0].total),
      byMeterId,
      recentRecords: recent,
    };
  }

  /**
   * DEBUG: Raw query to see what the JOIN returns
   */
  async debugRawJoin(vehicleId: string) {
    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const result = await this.vehicleHistoryRepo.query(
      `
      SELECT
        SUM(m.kwh_consumed_ac) as total_ac,
        SUM(v.kwh_delivered_dc) as total_dc,
        AVG(v.battery_temp) as avg_battery_temp,
        COUNT(v.id) as reading_count,
        MIN(v.timestamp) as earliest,
        MAX(v.timestamp) as latest
      FROM vehicle_history v
      INNER JOIN meter_history m ON
        v.vehicle_id = m.meter_id
        AND ABS(EXTRACT(EPOCH FROM (v.timestamp - m.timestamp))) <= 30
      WHERE v.vehicle_id = $1
        AND v.timestamp >= $2
    `,
      [vehicleId, last24Hours],
    );

    return {
      vehicleId,
      last24HoursStart: last24Hours.toISOString(),
      queryResult: result[0],
      explanation:
        result[0].reading_count === '0' || !result[0].reading_count
          ? '❌ JOIN returned 0 matches. Either meter_id != vehicle_id OR timestamps differ by >30 seconds'
          : `✅ Found ${result[0].reading_count} matching records`,
    };
  }
}
