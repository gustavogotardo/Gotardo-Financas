import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import type { RequestHandler } from 'express';
import { AppModule } from './app.module';

const PORT = Number(process.env.PORT ?? 3000);

const httpLogger = new Logger('HTTP');

const requestLogger: RequestHandler = (req, res, next) => {
  const started = Date.now();
  res.on('finish', () => {
    const auth = req.headers.authorization ? 'auth' : 'no-auth';
    httpLogger.log(
      `${req.method} ${req.originalUrl} ${res.statusCode} (${auth}, ${Date.now() - started}ms)`,
    );
  });
  next();
};

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  app.setGlobalPrefix('api/v1');
  app.use(requestLogger);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  await app.listen(PORT);
  Logger.log(`Gotardo API ouvindo em http://localhost:${PORT}/api/v1`, 'Bootstrap');
}

void bootstrap();
