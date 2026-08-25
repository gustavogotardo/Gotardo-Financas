import { Body, Controller, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import {
  NotificationsService,
  type NotificationPreferences,
  type NotificationRecord,
} from './notifications.service';
import type { AuthUser } from '../common/auth-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<NotificationRecord[]> {
    return this.notifications.list(user);
  }

  @Get('preferences')
  getPreferences(@CurrentUser() user: AuthUser): Promise<NotificationPreferences> {
    return this.notifications.getPreferences(user);
  }

  @Patch('preferences')
  updatePreferences(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdatePreferencesDto,
  ): Promise<NotificationPreferences> {
    return this.notifications.updatePreferences(user, dto);
  }

  @Patch(':id/read')
  markRead(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<NotificationRecord> {
    return this.notifications.markRead(user, id);
  }

  @Post('read-all')
  @HttpCode(204)
  async markAllRead(@CurrentUser() user: AuthUser): Promise<void> {
    await this.notifications.markAllRead(user);
  }
}
