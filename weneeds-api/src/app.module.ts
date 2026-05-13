import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AnalyticsModule } from './analytics/analytics.module';

@Module({
  imports: [AnalyticsModule],
  controllers: [AppController],
})
export class AppModule {}
