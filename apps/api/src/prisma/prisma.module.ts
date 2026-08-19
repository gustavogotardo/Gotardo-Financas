import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Global, Injectable, Module } from '@nestjs/common';
import { PrismaClient } from '@gotardo/db';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
