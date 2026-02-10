import { IsString, IsNumber, IsISO8601, Min, Max, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VehicleTelemetryDto {
  @ApiProperty({
    example: 'VEHICLE_001',
    description: 'Unique vehicle identifier',
  })
  @IsString()
  @IsNotEmpty()
  vehicleId: string;

  @ApiProperty({
    example: 75.5,
    description: 'State of Charge (battery %) 0-100',
  })
  @IsNumber()
  @Min(0)
  @Max(100)
  soc: number;

  @ApiProperty({
    example: 9.5,
    description: 'DC energy delivered to battery in kWh',
  })
  @IsNumber()
  @Min(0)
  kwhDeliveredDc: number;

  @ApiProperty({
    example: 28.5,
    description: 'Battery temperature in Celsius (-20 to 80)',
  })
  @IsNumber()
  @Min(-20)
  @Max(80)
  batteryTemp: number;

  @ApiProperty({
    example: '2026-02-09T12:00:00Z',
    description: 'ISO 8601 timestamp',
  })
  @IsISO8601()
  timestamp: string;
}
