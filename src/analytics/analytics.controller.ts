import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { PerformanceResponseDto } from './dto/performance-response.dto';

@ApiTags('Analytics')
@Controller('v1/analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('debug/meters')
  @ApiOperation({ 
    summary: 'DEBUG: Check all meter data in database',
    description: 'Shows total count and samples of meter_history records'
  })
  async debugMetersAll() {
    return this.analyticsService.debugAllMeterData();
  }

  @Get('debug/:vehicleId/join')
  @ApiOperation({ 
    summary: 'DEBUG: Check raw JOIN query result',
    description: 'Shows exactly what the analytics JOIN query returns'
  })
  @ApiParam({ 
    name: 'vehicleId', 
    example: 'VEHICLE_001'
  })
  async debugJoin(@Param('vehicleId') vehicleId: string) {
    return this.analyticsService.debugRawJoin(vehicleId);
  }

  @Get('debug/:vehicleId')
  @ApiOperation({ 
    summary: 'DEBUG: Check data availability for a vehicle',
    description: 'Shows what data exists in history tables for debugging'
  })
  @ApiParam({ 
    name: 'vehicleId', 
    example: 'VEHICLE_001'
  })
  async debugVehicle(@Param('vehicleId') vehicleId: string) {
    return this.analyticsService.debugVehicleData(vehicleId);
  }

  @Get('performance/:vehicleId')
  @ApiOperation({ 
    summary: 'Get 24-hour performance summary for a vehicle',
    description: 'Returns total energy consumed (AC), delivered (DC), efficiency ratio, and average battery temperature'
  })
  @ApiParam({ 
    name: 'vehicleId', 
    example: 'VEHICLE_001',
    description: 'Unique vehicle identifier'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Performance data retrieved successfully',
    type: PerformanceResponseDto
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Vehicle not found or no data available'
  })
  async getPerformance(
    @Param('vehicleId') vehicleId: string,
  ): Promise<PerformanceResponseDto> {
    return this.analyticsService.getPerformance(vehicleId);
  }

  @Get('history/:vehicleId')
  @ApiOperation({ 
    summary: 'Get historical readings for a vehicle',
    description: 'Returns time-series data for a specific vehicle within a date range'
  })
  @ApiParam({ 
    name: 'vehicleId', 
    example: 'VEHICLE_001'
  })
  @ApiQuery({ 
    name: 'startDate', 
    required: false,
    example: '2026-02-08T00:00:00Z',
    description: 'Start date (defaults to 24 hours ago)'
  })
  @ApiQuery({ 
    name: 'endDate', 
    required: false,
    example: '2026-02-09T23:59:59Z',
    description: 'End date (defaults to now)'
  })
  async getHistory(
    @Param('vehicleId') vehicleId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();
    
    return this.analyticsService.getVehicleHistory(vehicleId, start, end);
  }

  @Get('stats')
  @ApiOperation({ 
    summary: 'Get aggregate statistics for all vehicles',
    description: 'Returns overall fleet statistics for the last 24 hours'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Fleet statistics retrieved successfully'
  })
  async getStats() {
    return this.analyticsService.getAllVehiclesStats();
  }
}
