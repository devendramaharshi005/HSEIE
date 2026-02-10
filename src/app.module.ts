import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HealthController } from './health.controller';
import { IngestionModule } from './ingestion/ingestion.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { RedisModule } from './redis/redis.module';
import { QueueModule } from './queue/queue.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get('DB_HOST', 'localhost'),
        port: configService.get('DB_PORT', 5432),
        username: configService.get('DB_USERNAME', 'postgres'),
        password: configService.get('DB_PASSWORD', 'postgres'),
        database: configService.get('DB_DATABASE', 'energy_ingestion'),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        synchronize: false, // Use migrations in production
        logging: configService.get('NODE_ENV') === 'development',
      }),
    }),
    RedisModule,
    QueueModule,
    IngestionModule,
    AnalyticsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
