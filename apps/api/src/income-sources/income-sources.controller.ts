import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { FamilyRole } from '@gotardo/db';
import { IncomeSourcesService, type IncomeSourceRecord } from './income-sources.service';
import type { AuthUser } from '../common/auth-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateIncomeSourceDto } from './dto/create-income-source.dto';
import { UpdateIncomeSourceDto } from './dto/update-income-source.dto';

@Controller('income-sources')
export class IncomeSourcesController {
  constructor(private readonly incomeSources: IncomeSourcesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<IncomeSourceRecord[]> {
    return this.incomeSources.list(user);
  }

  @Roles(FamilyRole.OWNER, FamilyRole.ADMIN)
  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateIncomeSourceDto,
  ): Promise<IncomeSourceRecord> {
    return this.incomeSources.create(user, dto);
  }

  @Get(':id')
  getById(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<IncomeSourceRecord> {
    return this.incomeSources.getById(user, id);
  }

  @Roles(FamilyRole.OWNER, FamilyRole.ADMIN)
  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateIncomeSourceDto,
  ): Promise<IncomeSourceRecord> {
    return this.incomeSources.update(user, id, dto);
  }

  @Roles(FamilyRole.OWNER, FamilyRole.ADMIN)
  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<void> {
    await this.incomeSources.remove(user, id);
  }
}
