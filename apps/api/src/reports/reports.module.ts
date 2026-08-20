import { Module } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { MlModule } from '../ml/ml.module';

@Module({
  imports: [MlModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}