import { Module } from '@nestjs/common';
import { GoalsModule } from '../goals/goals.module';
import { AccountsModule } from '../accounts/accounts.module';
import { NotificationsService } from './notifications.service';
import { NotificationsCheckerService } from './notifications-checker.service';
import { NotificationsController } from './notifications.controller';

@Module({
  imports: [GoalsModule, AccountsModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsCheckerService],
  exports: [NotificationsCheckerService],
})
export class NotificationsModule {}
