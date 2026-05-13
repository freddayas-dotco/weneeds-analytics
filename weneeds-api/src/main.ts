import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: true,
    methods: ['GET'],
  });
  await app.listen(3000);
  console.log('Weneeds API running on http://localhost:3000');
}
bootstrap();
