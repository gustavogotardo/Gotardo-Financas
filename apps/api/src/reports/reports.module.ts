import { Module } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { MlModule } from '../ml/ml.module';
import { DebtsModule } from '../debts/debts.module';
import { GoalsModule } from '../goals/goals.module';

@Module({
  imports: [MlModule, DebtsModule, GoalsModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}