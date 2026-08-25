import { Module } from '@nestjs/common';
import { IncomeSourcesService } from './income-sources.service';
import { IncomeSourcesController } from './income-sources.controller';

@Module({
  controllers: [IncomeSourcesController],
  providers: [IncomeSourcesService],
})
export class IncomeSourcesModule {}
