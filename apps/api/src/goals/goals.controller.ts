import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { FamilyRole } from '@gotardo/db';
import { GoalsService, type GoalAllocationRecord, type GoalWithSummary } from './goals.service';
import type { AuthUser } from '../common/auth-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateGoalDto } from './dto/create-goal.dto';
import { UpdateGoalDto } from './dto/update-goal.dto';
import { CreateGoalAllocationDto } from './dto/create-goal-allocation.dto';

@Controller('goals')
export class GoalsController {
  constructor(private readonly goals: GoalsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<GoalWithSummary[]> {
    return this.goals.list(user);
  }

  @Roles(FamilyRole.OWNER, FamilyRole.ADMIN)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateGoalDto): Promise<GoalWithSummary> {
    return this.goals.create(user, dto);
  }

  @Get(':id')
  getById(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<GoalWithSummary> {
    return this.goals.getById(user, id);
  }

  @Roles(FamilyRole.OWNER, FamilyRole.ADMIN)
  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateGoalDto,
  ): Promise<GoalWithSummary> {
    return this.goals.update(user, id, dto);
  }

  @Roles(FamilyRole.OWNER, FamilyRole.ADMIN)
  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<void> {
    await this.goals.remove(user, id);
  }

  @Roles(FamilyRole.OWNER, FamilyRole.ADMIN)
  @Post(':id/allocations')
  allocate(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CreateGoalAllocationDto,
  ): Promise<GoalAllocationRecord> {
    return this.goals.allocate(user, id, dto);
  }

  @Get(':id/allocations')
  listAllocations(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<GoalAllocationRecord[]> {
    return this.goals.listAllocations(user, id);
  }
}
