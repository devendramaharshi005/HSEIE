import { ApiProperty } from '@nestjs/swagger';

export class PerformanceResponseDto {
  @ApiProperty({ 
    example: 'VEHICLE_001',
    description: 'Vehicle identifier'
  })
  vehicleId: string;

  @ApiProperty({ 
    example: '24h',
    description: 'Time period for analysis'
  })
  period: string;

  @ApiProperty({ 
    example: 120.50,
    description: 'Total AC energy consumed in kWh'
  })
  totalEnergyConsumedAc: number;

  @ApiProperty({ 
    example: 105.30,
    description: 'Total DC energy delivered in kWh'
  })
  totalEnergyDeliveredDc: number;

  @ApiProperty({ 
    example: 87.52,
    description: 'Efficiency ratio (DC/AC) in percentage'
  })
  efficiencyRatio: number;

  @ApiProperty({ 
    example: 28.75,
    description: 'Average battery temperature in Celsius'
  })
  avgBatteryTemp: number;
}


