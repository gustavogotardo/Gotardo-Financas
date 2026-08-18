import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';

const PORT = Number(process.env.PORT ?? 3000);

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  app.setGlobalPrefix('api/v1');

  await app.listen(PORT);
  Logger.log(`Gotardo API ouvindo em http://localhost:${PORT}/api/v1`, 'Bootstrap');
}

void bootstrap();
