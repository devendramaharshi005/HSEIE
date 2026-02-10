import { IsString, IsNumber, IsISO8601, Min, Max, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class MeterTelemetryDto {
  @ApiProperty({
    example: 'METER_001',
    description: 'Unique meter identifier',
  })
  @IsString()
  @IsNotEmpty()
  meterId: string;

  @ApiProperty({
    example: 10.5,
    description: 'AC energy consumed in kWh',
  })
  @IsNumber()
  @Min(0)
  kwhConsumedAc: number;

  @ApiProperty({
    example: 230,
    description: 'Voltage in volts (0-500V)',
  })
  @IsNumber()
  @Min(0)
  @Max(500)
  voltage: number;

  @ApiProperty({
    example: '2026-02-09T12:00:00Z',
    description: 'ISO 8601 timestamp',
  })
  @IsISO8601()
  timestamp: string;
}
