import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { StorageModule } from './storage/storage.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { FamilyModule } from './family/family.module';
import { AccountsModule } from './accounts/accounts.module';
import { CategoriesModule } from './categories/categories.module';
import { IncomeSourcesModule } from './income-sources/income-sources.module';
import { TransactionsModule } from './transactions/transactions.module';
import { EnvelopesModule } from './envelopes/envelopes.module';
import { GoalsModule } from './goals/goals.module';
import { ReportsModule } from './reports/reports.module';
import { ImportsModule } from './imports/imports.module';
import { MlModule } from './ml/ml.module';
import { NotificationsModule } from './notifications/notifications.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    PrismaModule,
    StorageModule,
    HealthModule,
    AuthModule,
    FamilyModule,
    AccountsModule,
    CategoriesModule,
    IncomeSourcesModule,
    TransactionsModule,
    EnvelopesModule,
    GoalsModule,
    ReportsModule,
    ImportsModule,
    MlModule,
    NotificationsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
