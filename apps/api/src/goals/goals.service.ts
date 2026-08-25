import { Injectable, NotFoundException } from '@nestjs/common';
import { GoalStatus, Prisma } from '@gotardo/db';
import { PrismaService } from '../prisma/prisma.module';
import { addMonthsUtc } from '../common/date-utils';
import type { AuthUser } from '../common/auth-user';
import type { CreateGoalDto } from './dto/create-goal.dto';
import type { UpdateGoalDto } from './dto/update-goal.dto';
import type { CreateGoalAllocationDto } from './dto/create-goal-allocation.dto';

const GOAL_SELECT = {
  id: true,
  name: true,
  description: true,
  icon: true,
  targetAmount: true,
  deadline: true,
  priority: true,
  status: true,
  monthlyContribution: true,
  strategy: true,
  createdAt: true,
  updatedAt: true,
} as const;

type GoalBase = Prisma.FinancialGoalGetPayload<{ select: typeof GOAL_SELECT }>;

export type GoalWithSummary = GoalBase & {
  currentAmount: string;
  progress: string;
  monthlyRequired: string | null;
  predictedCompletionDate: string | null;
  isAtRisk: boolean;
};

const ALLOCATION_SELECT = {
  id: true,
  amount: true,
  date: true,
  note: true,
  source: true,
  createdAt: true,
} as const;

export type GoalAllocationRecord = Prisma.FinancialGoalAllocationGetPayload<{
  select: typeof ALLOCATION_SELECT;
}>;

@Injectable()
export class GoalsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: AuthUser): Promise<GoalWithSummary[]> {
    const goals = await this.prisma.financialGoal.findMany({
      where: { familyId: user.familyId, deletedAt: null },
      select: GOAL_SELECT,
      orderBy: [{ priority: 'asc' }, { name: 'asc' }],
    });
    return this.withSummaries(goals);
  }

  async create(user: AuthUser, dto: CreateGoalDto): Promise<GoalWithSummary> {
    const goal = await this.prisma.financialGoal.create({
      data: {
        familyId: user.familyId,
        name: dto.name,
        description: dto.description,
        icon: dto.icon,
        targetAmount: dto.targetAmount,
        deadline: dto.deadline,
        priority: dto.priority,
        strategy: dto.strategy,
        monthlyContribution: dto.monthlyContribution,
      },
      select: GOAL_SELECT,
    });
    return (await this.withSummaries([goal]))[0]!;
  }

  async getById(user: AuthUser, id: string): Promise<GoalWithSummary> {
    const goal = await this.findGoalOrThrow(user, id);
    return (await this.withSummaries([goal]))[0]!;
  }

  async update(user: AuthUser, id: string, dto: UpdateGoalDto): Promise<GoalWithSummary> {
    await this.findGoalOrThrow(user, id);
    const goal = await this.prisma.financialGoal.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        icon: dto.icon,
        targetAmount: dto.targetAmount,
        deadline: dto.deadline,
        priority: dto.priority,
        strategy: dto.strategy,
        monthlyContribution: dto.monthlyContribution,
        status: dto.status,
      },
      select: GOAL_SELECT,
    });
    return (await this.withSummaries([goal]))[0]!;
  }

  async remove(user: AuthUser, id: string): Promise<void> {
    await this.findGoalOrThrow(user, id);
    await this.prisma.financialGoal.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async allocate(
    user: AuthUser,
    goalId: string,
    dto: CreateGoalAllocationDto,
  ): Promise<GoalAllocationRecord> {
    await this.findGoalOrThrow(user, goalId);
    return this.prisma.financialGoalAllocation.create({
      data: {
        goalId,
        amount: dto.amount,
        date: dto.date ?? new Date(),
        note: dto.note,
        source: dto.source,
      },
      select: ALLOCATION_SELECT,
    });
  }

  async listAllocations(user: AuthUser, goalId: string): Promise<GoalAllocationRecord[]> {
    await this.findGoalOrThrow(user, goalId);
    return this.prisma.financialGoalAllocation.findMany({
      where: { goalId },
      select: ALLOCATION_SELECT,
      orderBy: { date: 'desc' },
    });
  }

  private async findGoalOrThrow(user: AuthUser, id: string): Promise<GoalBase> {
    const goal = await this.prisma.financialGoal.findFirst({
      where: { id, familyId: user.familyId, deletedAt: null },
      select: GOAL_SELECT,
    });
    if (!goal) {
      throw new NotFoundException('Objetivo não encontrado');
    }
    return goal;
  }

  private async withSummaries(goals: GoalBase[]): Promise<GoalWithSummary[]> {
    const ids = goals.map((g) => g.id);
    if (ids.length === 0) {
      return [];
    }
    const contributed = await this.prisma.financialGoalAllocation.groupBy({
      by: ['goalId'],
      where: { goalId: { in: ids } },
      _sum: { amount: true },
    });
    const currentAmountMap = new Map(
      contributed.map((c) => [c.goalId, c._sum.amount ?? new Prisma.Decimal(0)]),
    );

    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    return goals.map((goal) => {
      const currentAmount = currentAmountMap.get(goal.id) ?? new Prisma.Decimal(0);
      const targetAmount = goal.targetAmount;

      const progress = targetAmount.isZero()
        ? '0.00'
        : currentAmount.dividedBy(targetAmount).times(100).toFixed(2);

      const shortfall = targetAmount.minus(currentAmount);

      let monthlyRequiredDecimal: Prisma.Decimal | null = null;
      let monthlyRequired: string | null = null;
      let deadlineIsPast = false;
      if (goal.deadline) {
        const deadlineDateOnly = new Date(
          Date.UTC(
            goal.deadline.getUTCFullYear(),
            goal.deadline.getUTCMonth(),
            goal.deadline.getUTCDate(),
          ),
        );
        deadlineIsPast = deadlineDateOnly.getTime() < today.getTime();

        let mesesRestantes =
          (deadlineDateOnly.getUTCFullYear() - today.getUTCFullYear()) * 12 +
          (deadlineDateOnly.getUTCMonth() - today.getUTCMonth());
        if (mesesRestantes < 1) {
          mesesRestantes = 1;
        }

        monthlyRequiredDecimal = shortfall.isNegative()
          ? new Prisma.Decimal(0)
          : shortfall.dividedBy(mesesRestantes);
        monthlyRequired = monthlyRequiredDecimal.toFixed(2);
      }

      let predictedCompletionDate: string | null = null;
      if (goal.monthlyContribution && goal.monthlyContribution.greaterThan(0)) {
        const monthsNeeded = shortfall.lessThanOrEqualTo(0)
          ? 0
          : shortfall.dividedBy(goal.monthlyContribution).ceil().toNumber();
        const predictedDate = addMonthsUtc(today, monthsNeeded);
        // Serializado ao meio-dia UTC (não meia-noite) para não exibir um dia
        // adiantado em fusos negativos ao formatar no cliente (ex.: BRT/UTC-3,
        // o público-alvo deste app) — mesma âncora usada no `deadline` recebido
        // do frontend (`T12:00:00.000Z`).
        predictedCompletionDate = new Date(
          Date.UTC(
            predictedDate.getUTCFullYear(),
            predictedDate.getUTCMonth(),
            predictedDate.getUTCDate(),
            12,
          ),
        ).toISOString();
      }

      const deadlineBlown = deadlineIsPast && currentAmount.lessThan(targetAmount);
      const contributionInsufficient =
        !!goal.deadline &&
        !!goal.monthlyContribution &&
        goal.monthlyContribution.greaterThan(0) &&
        monthlyRequiredDecimal !== null &&
        goal.monthlyContribution.lessThan(monthlyRequiredDecimal);
      const isAtRisk =
        goal.status === GoalStatus.ACTIVE && (deadlineBlown || contributionInsufficient);

      return {
        ...goal,
        currentAmount: currentAmount.toString(),
        progress,
        monthlyRequired,
        predictedCompletionDate,
        isAtRisk,
      };
    });
  }
}
