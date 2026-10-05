import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './pg-errors.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'] });
  app.enableCors({ origin: (process.env.CORS_ORIGIN || 'http://localhost:3000').split(','), credentials: true });
  app.useGlobalFilters(new AllExceptionsFilter());
  const port = parseInt(process.env.PORT || '4000', 10);
  await app.listen(port);
  console.log(`API listening on :${port}`);
}
bootstrap();
