import { Controller, Post, Get, Body, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { IngestionService } from './ingestion.service';
import { MeterTelemetryDto } from './dto/meter-telemetry.dto';
import { VehicleTelemetryDto } from './dto/vehicle-telemetry.dto';

@ApiTags('Ingestion')
@Controller('v1/ingest')
export class IngestionController {
  constructor(private readonly ingestionService: IngestionService) {}

  @Post('meter')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Ingest meter telemetry data',
    description: 'Accepts meter readings and stores in hot (current) and cold (history) tables',
  })
  @ApiResponse({
    status: 201,
    description: 'Telemetry ingested successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid data format',
  })
  async ingestMeter(@Body() dto: MeterTelemetryDto) {
    return this.ingestionService.ingestMeter(dto);
  }

  @Post('vehicle')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Ingest vehicle telemetry data',
    description: 'Accepts vehicle readings and stores in hot (current) and cold (history) tables',
  })
  @ApiResponse({
    status: 201,
    description: 'Telemetry ingested successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid data format',
  })
  async ingestVehicle(@Body() dto: VehicleTelemetryDto) {
    return this.ingestionService.ingestVehicle(dto);
  }

  @Get('meter/:meterId/current')
  @ApiOperation({
    summary: 'Get current state of a meter',
    description: 'Returns the latest telemetry data for a specific meter',
  })
  @ApiParam({ name: 'meterId', example: 'METER_001' })
  @ApiResponse({
    status: 200,
    description: 'Current meter state',
  })
  async getMeterCurrent(@Param('meterId') meterId: string) {
    return this.ingestionService.getMeterCurrent(meterId);
  }

  @Get('vehicle/:vehicleId/current')
  @ApiOperation({
    summary: 'Get current state of a vehicle',
    description: 'Returns the latest telemetry data for a specific vehicle',
  })
  @ApiParam({ name: 'vehicleId', example: 'VEHICLE_001' })
  @ApiResponse({
    status: 200,
    description: 'Current vehicle state',
  })
  async getVehicleCurrent(@Param('vehicleId') vehicleId: string) {
    return this.ingestionService.getVehicleCurrent(vehicleId);
  }

  @Get('queue/stats')
  @ApiOperation({
    summary: 'Get queue statistics',
    description:
      'Returns current status of Redis ingestion queues (waiting, active, completed, failed jobs)',
  })
  @ApiResponse({
    status: 200,
    description: 'Queue statistics retrieved successfully',
  })
  async getQueueStats() {
    return this.ingestionService.getQueueStats();
  }
}
