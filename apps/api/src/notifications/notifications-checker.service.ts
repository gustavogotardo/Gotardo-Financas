import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  AccountType,
  DocumentStatus,
  NotificationSeverity,
  NotificationType,
  Prisma,
} from '@gotardo/db';
import { PrismaService } from '../prisma/prisma.module';
import { GoalsService } from '../goals/goals.service';
import { AccountsService } from '../accounts/accounts.service';
import { EnvelopesService } from '../envelopes/envelopes.service';
import { systemAuthUser } from '../common/auth-user';

type FamilyMember = { id: string; mutedNotificationTypes: NotificationType[] };

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Gera notificações periódicas (§2.15/§19 da especificação técnica) para 4 dos
 * 7 `NotificationType`: BUDGET_EXCEEDED, GOAL_AT_RISK, ACCOUNT_DUE e
 * DOCUMENT_PENDING. ANOMALY_DETECTED, DUPLICATE_DETECTED e RECURRING_GENERATED
 * ficam fora do escopo desta etapa (sem motor de execução de recorrências
 * ainda, e sem os checks de anomalia/duplicidade implementados).
 */
@Injectable()
export class NotificationsCheckerService {
  private readonly logger = new Logger(NotificationsCheckerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly goalsService: GoalsService,
    private readonly accountsService: AccountsService,
    private readonly envelopesService: EnvelopesService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async handleCron(): Promise<void> {
    await this.runChecks();
  }

  /**
   * Ponto de entrada público (também chamado diretamente pelo cron acima) —
   * permite que testes disparem os checks de forma síncrona sem esperar um
   * tick real do cron.
   */
  async runChecks(): Promise<void> {
    const families = await this.prisma.family.findMany({ select: { id: true } });
    for (const family of families) {
      // Todo o corpo do loop — inclusive a busca de membros — fica dentro do
      // try/catch: uma falha transitória de banco ao buscar membros de uma
      // família não pode abortar `runChecks()` inteiro e impedir que as
      // famílias seguintes sejam checadas.
      try {
        const members = await this.prisma.user.findMany({
          where: { familyId: family.id },
          select: { id: true, mutedNotificationTypes: true },
        });
        if (members.length === 0) {
          continue;
        }
        await this.checkBudgetExceeded(family.id, members);
        await this.checkGoalAtRisk(family.id, members);
        await this.checkAccountDue(family.id, members);
        await this.checkDocumentPending(family.id, members);
      } catch (error) {
        // Uma falha ao checar uma família não deve interromper as demais.
        this.logger.error(`Falha ao rodar checks de notificação para família ${family.id}`, error);
      }
    }
  }

  private async checkBudgetExceeded(familyId: string, members: FamilyMember[]): Promise<void> {
    const period = this.monthPeriod(new Date());

    // Reaproveita `EnvelopesService.list` (mesmo cálculo all-time de
    // alocado/gasto que `withSummaries` usa) para que este check nunca
    // divirja do saldo "Alocado"/"Gasto"/"Saldo" que a página de Envelopes
    // exibe. Um recorte por mês corrente aqui faria o alerta parar de
    // disparar assim que o mês da alocação passasse, mesmo com o envelope
    // permanentemente estourado.
    const envelopes = await this.envelopesService.list(systemAuthUser(familyId));

    for (const envelope of envelopes) {
      if (!envelope.isActive) {
        continue;
      }
      const allocatedAmount = new Prisma.Decimal(envelope.allocated);
      const spentAmount = new Prisma.Decimal(envelope.spent);
      if (allocatedAmount.lessThanOrEqualTo(0) || !spentAmount.greaterThan(allocatedAmount)) {
        continue;
      }
      await this.createIfNotDuplicate(
        members,
        familyId,
        NotificationType.BUDGET_EXCEEDED,
        `${NotificationType.BUDGET_EXCEEDED}:${envelope.id}:${period}`,
        'Orçamento estourado',
        `O envelope "${envelope.name}" já gastou ${this.formatBrl(spentAmount)} de ${this.formatBrl(allocatedAmount)} alocados.`,
        NotificationSeverity.WARNING,
        '/dashboard',
        {
          envelopeId: envelope.id,
          allocated: allocatedAmount.toString(),
          spent: spentAmount.toString(),
        },
      );
    }
  }

  private async checkGoalAtRisk(familyId: string, members: FamilyMember[]): Promise<void> {
    const period = this.monthPeriod(new Date());
    // GoalsService só usa `familyId` do AuthUser aqui — os demais campos são
    // irrelevantes para uma listagem em nome do sistema (job periódico).
    const goals = await this.goalsService.list(systemAuthUser(familyId));

    for (const goal of goals) {
      if (!goal.isAtRisk) {
        continue;
      }
      await this.createIfNotDuplicate(
        members,
        familyId,
        NotificationType.GOAL_AT_RISK,
        `${NotificationType.GOAL_AT_RISK}:${goal.id}:${period}`,
        'Meta em risco',
        `A meta "${goal.name}" está em risco de não ser concluída no prazo.`,
        NotificationSeverity.WARNING,
        '/metas',
        { goalId: goal.id },
      );
    }
  }

  private async checkAccountDue(familyId: string, members: FamilyMember[]): Promise<void> {
    const accounts = await this.prisma.account.findMany({
      where: {
        familyId,
        type: AccountType.CREDIT_CARD,
        deletedAt: null,
        billingDay: { not: null },
        dueDay: { not: null },
      },
      select: { id: true, name: true, billingDay: true },
    });
    if (accounts.length === 0) {
      return;
    }

    const today = this.todayUtc();
    // AuthUser "de sistema": getInvoice só usa familyId para o escopo por tenant.
    const pseudoUser = systemAuthUser(familyId);
    for (const account of accounts) {
      let dueDate: Date;
      try {
        // O vencimento "atual" é o da fatura do ciclo mais recentemente
        // fechado (não necessariamente a do mês corrente — se o dia de
        // fechamento deste mês ainda não chegou, a fatura em aberto é a que
        // fechou no mês anterior). Reaproveita exatamente a mesma semântica
        // de fechamento/vencimento de getInvoice (E2.2), só resolvendo o
        // período explicitamente em vez de usar o padrão "mês corrente", pra
        // nunca divergir da data que "Ver fatura" mostraria para esse ciclo.
        const billingDay = account.billingDay as number;
        const closedThisMonth = today.getUTCDate() >= billingDay;
        const closingMonth = new Date(
          Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + (closedThisMonth ? 0 : -1), 1),
        );
        const period = this.monthPeriod(closingMonth);
        const invoice = await this.accountsService.getInvoice(pseudoUser, account.id, period);
        dueDate = new Date(invoice.dueDate);
      } catch (error) {
        this.logger.warn(`Falha ao calcular vencimento da fatura ${account.id}`, error);
        continue;
      }
      const diffDays = Math.round((dueDate.getTime() - today.getTime()) / ONE_DAY_MS);
      if (diffDays < 0 || diffDays > 3) {
        continue;
      }
      const period = this.dayPeriod(dueDate);
      await this.createIfNotDuplicate(
        members,
        familyId,
        NotificationType.ACCOUNT_DUE,
        `${NotificationType.ACCOUNT_DUE}:${account.id}:${period}`,
        'Fatura próxima do vencimento',
        `A fatura do cartão "${account.name}" vence em ${this.formatDateBr(dueDate)}.`,
        NotificationSeverity.INFO,
        '/dashboard',
        { accountId: account.id, dueDate: dueDate.toISOString() },
      );
    }
  }

  private async checkDocumentPending(familyId: string, members: FamilyMember[]): Promise<void> {
    const cutoff = new Date(Date.now() - ONE_DAY_MS);
    const documents = await this.prisma.document.findMany({
      where: {
        familyId,
        status: DocumentStatus.PENDING,
        deletedAt: null,
        createdAt: { lte: cutoff },
      },
      select: { id: true, originalName: true },
    });

    for (const document of documents) {
      await this.createIfNotDuplicate(
        members,
        familyId,
        NotificationType.DOCUMENT_PENDING,
        `${NotificationType.DOCUMENT_PENDING}:${document.id}`,
        'Importação pendente',
        `A importação "${document.originalName}" está pendente há mais de 24 horas.`,
        NotificationSeverity.INFO,
        '/dashboard',
        { documentId: document.id },
      );
    }
  }

  /**
   * Cria uma notificação para cada membro da família que não silenciou o
   * `type`, uma vez por `dedupeKey` por usuário (a chave já embute o período
   * relevante — mensal ou diário — então a simples existência de um registro
   * com essa chave para o usuário basta como guarda de "já notificado").
   *
   * O `findFirst` abaixo é só um atalho para o caso comum (evita uma
   * tentativa de `create` desperdiçada quando já sabemos que existe). A
   * garantia real contra duplicatas é a constraint `@@unique([userId,
   * dedupeKey])` no schema: sob `runChecks()` concorrentes, duas checagens
   * podem passar pelo `findFirst` antes de qualquer uma criar o registro
   * (TOCTOU). Nesse caso o `create` perdedor falha com `P2002`, que tratamos
   * como "já existe, tudo certo" — não é um erro, é a duplicata concorrente
   * esperada sendo barrada pelo banco.
   */
  private async createIfNotDuplicate(
    members: FamilyMember[],
    familyId: string,
    type: NotificationType,
    dedupeKey: string,
    title: string,
    message: string,
    severity: NotificationSeverity,
    actionUrl?: string,
    metadata?: Prisma.InputJsonValue,
  ): Promise<void> {
    for (const member of members) {
      if (member.mutedNotificationTypes.includes(type)) {
        continue;
      }
      const exists = await this.prisma.notification.findFirst({
        where: { userId: member.id, dedupeKey },
        select: { id: true },
      });
      if (exists) {
        continue;
      }
      try {
        await this.prisma.notification.create({
          data: {
            familyId,
            userId: member.id,
            type,
            title,
            message,
            severity,
            actionUrl,
            metadata,
            dedupeKey,
          },
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          // Corrida concorrente: outra execução de runChecks() já criou essa
          // notificação entre nosso findFirst e este create. Comportamento
          // esperado, não um erro — segue para o próximo membro.
          continue;
        }
        throw error;
      }
    }
  }

  private monthPeriod(date: Date): string {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  private dayPeriod(date: Date): string {
    return `${this.monthPeriod(date)}-${String(date.getUTCDate()).padStart(2, '0')}`;
  }

  private todayUtc(): Date {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }

  private formatBrl(value: Prisma.Decimal): string {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
      value.toNumber(),
    );
  }

  private formatDateBr(date: Date): string {
    return `${String(date.getUTCDate()).padStart(2, '0')}/${String(date.getUTCMonth() + 1).padStart(2, '0')}/${date.getUTCFullYear()}`;
  }
}
