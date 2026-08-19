import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { FamilyRole } from '@gotardo/db';
import { AccountsService, type AccountRecord } from './accounts.service';
import type { AuthUser } from '../common/auth-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';

@Controller('accounts')
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<AccountRecord[]> {
    return this.accounts.list(user);
  }

  @Roles(FamilyRole.OWNER, FamilyRole.ADMIN)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateAccountDto): Promise<AccountRecord> {
    return this.accounts.create(user, dto);
  }

  @Get(':id')
  getById(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<AccountRecord> {
    return this.accounts.getById(user, id);
  }

  @Roles(FamilyRole.OWNER, FamilyRole.ADMIN)
  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateAccountDto,
  ): Promise<AccountRecord> {
    return this.accounts.update(user, id, dto);
  }

  @Roles(FamilyRole.OWNER, FamilyRole.ADMIN)
  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<void> {
    await this.accounts.remove(user, id);
  }
}
