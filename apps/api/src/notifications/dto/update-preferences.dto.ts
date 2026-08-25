import { IsArray, IsEnum } from 'class-validator';
import { NotificationType } from '@gotardo/db';

export class UpdatePreferencesDto {
  @IsArray()
  @IsEnum(NotificationType, { each: true })
  mutedNotificationTypes!: NotificationType[];
}
