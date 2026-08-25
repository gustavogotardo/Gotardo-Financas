import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type NotificationType } from '@gotardo/db';
import { PrismaService } from '../prisma/prisma.module';
import type { AuthUser } from '../common/auth-user';
import type { UpdatePreferencesDto } from './dto/update-preferences.dto';

export type NotificationRecord = Prisma.NotificationGetPayload<true>;

export type NotificationPreferences = {
  mutedNotificationTypes: NotificationType[];
};

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  list(user: AuthUser): Promise<NotificationRecord[]> {
    return this.prisma.notification.findMany({
      where: { userId: user.id, familyId: user.familyId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async markRead(user: AuthUser, id: string): Promise<NotificationRecord> {
    const notification = await this.prisma.notification.findFirst({
      where: { id, userId: user.id },
    });
    if (!notification) {
      throw new NotFoundException('Notificação não encontrada');
    }
    return this.prisma.notification.update({
      where: { id },
      data: { isRead: true, readAt: new Date() },
    });
  }

  async markAllRead(user: AuthUser): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { userId: user.id, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
  }

  async getPreferences(user: AuthUser): Promise<NotificationPreferences> {
    const record = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { mutedNotificationTypes: true },
    });
    return { mutedNotificationTypes: record.mutedNotificationTypes };
  }

  async updatePreferences(
    user: AuthUser,
    dto: UpdatePreferencesDto,
  ): Promise<NotificationPreferences> {
    const record = await this.prisma.user.update({
      where: { id: user.id },
      data: { mutedNotificationTypes: dto.mutedNotificationTypes },
      select: { mutedNotificationTypes: true },
    });
    return { mutedNotificationTypes: record.mutedNotificationTypes };
  }
}
