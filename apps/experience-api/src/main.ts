import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { appModule } from './app.js';
import { openDefaultDeviceStore } from './devices.js';
import { Jellyfin } from './jellyfin.js';
import { createMockJellyfin, jellyfinMode } from './mock-jellyfin.js';

async function main() {
  const port = Number(process.env.HOUSEHOLD_API_PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid HOUSEHOLD_API_PORT');
  const mode = jellyfinMode(process.env);
  const devices = openDefaultDeviceStore();
  const mock = mode === 'mock' ? await createMockJellyfin() : null;
  const shutdown = mock ? () => new Promise<void>((resolve, reject) => mock.server.close((error) => error ? reject(error) : resolve())) : undefined;
  const app = await NestFactory.create(appModule(devices, mock?.jellyfin ?? new Jellyfin(), mode, shutdown), { logger: ['error', 'warn'] });
  app.use((_request: unknown, response: { setHeader(name: string, value: string): void }, next: () => void) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });
  const document = SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('Household Experience API').setVersion('1').addBearerAuth().build());
  SwaggerModule.setup('openapi', app, document);
  app.enableShutdownHooks();
  await app.listen(port, '127.0.0.1');
}

void main();
