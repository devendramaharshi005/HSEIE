import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { AnalyticsCachedService } from './analytics-cached.service';
import { PerformanceResponseDto } from './dto/performance-response.dto';

@ApiTags('Analytics')
@Controller('v1/analytics')
export class AnalyticsController {
  private readonly USE_CACHE = process.env.USE_CACHE !== 'false'; // Default: true

  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly analyticsCachedService: AnalyticsCachedService,
  ) {}

  @Get('performance/:vehicleId')
  @ApiOperation({
    summary: 'Get 24-hour performance summary for a vehicle',
    description:
      'Returns total energy consumed (AC), delivered (DC), efficiency ratio, and average battery temperature. Uses Redis cache when enabled.',
  })
  @ApiParam({
    name: 'vehicleId',
    example: 'VEHICLE_001',
    description: 'Unique vehicle identifier',
  })
  @ApiResponse({
    status: 200,
    description: 'Performance data retrieved successfully',
    type: PerformanceResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Vehicle not found or no data available',
  })
  async getPerformance(@Param('vehicleId') vehicleId: string): Promise<PerformanceResponseDto> {
    // Use cached service if cache is enabled, otherwise use regular service
    if (this.USE_CACHE) {
      return this.analyticsCachedService.getPerformance(vehicleId);
    }
    return this.analyticsService.getPerformance(vehicleId);
  }
}
