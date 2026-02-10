import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { IngestionController } from './ingestion.controller';
import { IngestionService } from './ingestion.service';
import { MeterCurrent } from './entities/meter-current.entity';
import { MeterHistory } from './entities/meter-history.entity';
import { VehicleCurrent } from './entities/vehicle-current.entity';
import { VehicleHistory } from './entities/vehicle-history.entity';
import { MeterIngestionProcessor } from '../queue/processors/meter-ingestion.processor';
import { VehicleIngestionProcessor } from '../queue/processors/vehicle-ingestion.processor';

@Module({
  imports: [
    TypeOrmModule.forFeature([MeterCurrent, MeterHistory, VehicleCurrent, VehicleHistory]),
    BullModule.registerQueue({ name: 'meter-ingestion' }, { name: 'vehicle-ingestion' }),
  ],
  controllers: [IngestionController],
  providers: [IngestionService, MeterIngestionProcessor, VehicleIngestionProcessor],
  exports: [IngestionService],
})
export class IngestionModule {}
