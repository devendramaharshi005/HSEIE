import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { AnalyticsCachedService } from './analytics-cached.service';
import { VehicleHistory } from '../ingestion/entities/vehicle-history.entity';
import { MeterHistory } from '../ingestion/entities/meter-history.entity';

@Module({
  imports: [TypeOrmModule.forFeature([VehicleHistory, MeterHistory])],
  controllers: [AnalyticsController],
  providers: [
    AnalyticsService,
    AnalyticsCachedService,
    {
      provide: 'ANALYTICS_SERVICE',
      useFactory: (cachedService: AnalyticsCachedService, regularService: AnalyticsService) => {
        // Use cached service if USE_CACHE is enabled, otherwise use regular service
        const USE_CACHE = process.env.USE_CACHE !== 'false';
        return USE_CACHE ? cachedService : regularService;
      },
      inject: [AnalyticsCachedService, AnalyticsService],
    },
  ],
  exports: [AnalyticsService, AnalyticsCachedService],
})
export class AnalyticsModule {}
