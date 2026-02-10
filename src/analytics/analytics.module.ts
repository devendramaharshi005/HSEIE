import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { VehicleHistory } from '../ingestion/entities/vehicle-history.entity';
import { MeterHistory } from '../ingestion/entities/meter-history.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      VehicleHistory,
      MeterHistory,
    ]),
  ],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
