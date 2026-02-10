import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable CORS
  app.enableCors();

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Swagger API documentation
  const config = new DocumentBuilder()
    .setTitle('Energy Ingestion API')
    .setDescription('High-Scale Energy Ingestion Engine - 10K+ Smart Meters & EV Fleets')
    .setVersion('1.0')
    .addTag('Ingestion', 'Telemetry data ingestion endpoints')
    .addTag('Analytics', 'Performance analytics endpoints')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port);

  console.log('\n🚀 ================================================');
  console.log('🚀  High-Scale Energy Ingestion Engine');
  console.log('🚀 ================================================');
  console.log(`🌐  API Server: http://localhost:${port}`);
  console.log(`📚  API Docs: http://localhost:${port}/api`);
  console.log(`💚  Health Check: http://localhost:${port}/health`);
  console.log('🚀 ================================================\n');
}

bootstrap();
