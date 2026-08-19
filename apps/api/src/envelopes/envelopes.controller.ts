import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { FamilyRole } from '@gotardo/db';
import {
  EnvelopesService,
  type EnvelopeAllocationRecord,
  type EnvelopeWithSummary,
} from './envelopes.service';
import type { AuthUser } from '../common/auth-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateEnvelopeDto } from './dto/create-envelope.dto';
import { UpdateEnvelopeDto } from './dto/update-envelope.dto';
import { CreateAllocationDto } from './dto/create-allocation.dto';

@Controller('envelopes')
export class EnvelopesController {
  constructor(private readonly envelopes: EnvelopesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<EnvelopeWithSummary[]> {
    return this.envelopes.list(user);
  }

  @Roles(FamilyRole.OWNER, FamilyRole.ADMIN)
  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateEnvelopeDto,
  ): Promise<EnvelopeWithSummary> {
    return this.envelopes.create(user, dto);
  }

  @Get(':id')
  getById(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<EnvelopeWithSummary> {
    return this.envelopes.getById(user, id);
  }

  @Roles(FamilyRole.OWNER, FamilyRole.ADMIN)
  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateEnvelopeDto,
  ): Promise<EnvelopeWithSummary> {
    return this.envelopes.update(user, id, dto);
  }

  @Roles(FamilyRole.OWNER, FamilyRole.ADMIN)
  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<void> {
    await this.envelopes.remove(user, id);
  }

  @Roles(FamilyRole.OWNER, FamilyRole.ADMIN)
  @Post(':id/allocations')
  allocate(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CreateAllocationDto,
  ): Promise<EnvelopeAllocationRecord> {
    return this.envelopes.allocate(user, id, dto);
  }

  @Get(':id/allocations')
  listAllocations(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<EnvelopeAllocationRecord[]> {
    return this.envelopes.listAllocations(user, id);
  }
}
