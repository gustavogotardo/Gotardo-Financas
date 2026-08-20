import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, TransactionSource, TransactionStatus, TransactionType } from '@gotardo/db';
import { Queue, Worker } from 'bullmq';
import { extname } from 'node:path';
import type { AuthUser } from '../common/auth-user';
import { CategorySuggesterService } from '../ml/category-suggester.service';
import { PrismaService } from '../prisma/prisma.module';
import { StorageService } from '../storage/storage.service';
import { parseCsv } from './parsers/csv';
import { parseOfx } from './parsers/ofx';
import { normalizeDescription, type ParsedTransaction } from './parsers/types';

const ALLOWED_EXTENSIONS = new Set(['ofx', 'qfx', 'csv']);
const MAX_FILE_SIZE = 5 * 1024 * 1024;

const DOCUMENT_SELECT = {
  id: true,
  originalName: true,
  mimeType: true,
  sizeBytes: true,
  status: true,
  errorMessage: true,
  createdAt: true,
} as const;

export type ImportJob = {
  documentId: string;
  familyId: string;
  accountId: string;
};

export type ImportRecord = Prisma.DocumentGetPayload<{ select: typeof DOCUMENT_SELECT }> & {
  transactionCount: number;
};

export type ImportDetail = ImportRecord & {
  transactions: {
    id: string;
    date: Date;
    description: string;
    amount: Prisma.Decimal;
    type: TransactionType;
    status: TransactionStatus;
  }[];
};

@Injectable()
export class ImportsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ImportsService.name);
  private queue: Queue | null = null;
  private worker: Worker | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly config: ConfigService,
    private readonly suggester: CategorySuggesterService,
  ) {}

  async onModuleInit(): Promise<void> {
    const url = this.config.get<string>('REDIS_URL');
    if (!url) {
      return;
    }
    const connection = { url };
    this.queue = new Queue('imports', { connection });
    this.worker = new Worker(
      'imports',
      async (job) => {
        await this.process(job.data as ImportJob);
      },
      { connection },
    );
    this.worker.on('failed', (job, error) => {
      this.logger.error(`Job de importação ${job?.id} falhou: ${error.message}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }

  get queueEnabled(): boolean {
    return Boolean(this.queue);
  }

  async upload(
    user: AuthUser,
    file: Express.Multer.File,
    accountId: string,
  ): Promise<ImportRecord> {
    if (!file) {
      throw new BadRequestException('Envie um arquivo');
    }
    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException('Arquivo maior que 5 MB');
    }
    const ext = extname(file.originalname).replace('.', '').toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      throw new BadRequestException('Formato não suportado (use OFX/QFX ou CSV)');
    }
    await this.ensureAccount(user, accountId);

    const storageKey = this.storage.keyFor(user.familyId, ext);
    await this.storage.put(storageKey, file.buffer, file.mimetype);
    const document = await this.prisma.document.create({
      data: {
        familyId: user.familyId,
        storageKey,
        originalName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
      },
      select: DOCUMENT_SELECT,
    });

    const job: ImportJob = { documentId: document.id, familyId: user.familyId, accountId };
    if (this.queue) {
      await this.queue.add('process', job);
    } else {
      await this.process(job);
    }
    return this.getById(user, document.id);
  }

  async process(job: ImportJob): Promise<void> {
    const { documentId, familyId, accountId } = job;
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, familyId },
    });
    if (!document || document.status === 'PROCESSED') {
      return;
    }
    try {
      const buffer = await this.storage.get(document.storageKey);
      const ext = extname(document.storageKey).replace('.', '').toLowerCase();
      const parsed =
        ext === 'csv' ? parseCsv(buffer.toString('utf8')) : parseOfx(buffer.toString('utf8'));

      const existing = await this.findExistingKeys(familyId, accountId);
      const toCreate = parsed.filter((tx) => !existing.has(this.txKey(tx)));

      const suggestedCategoryIds = await this.suggester.suggestMany(
        familyId,
        toCreate.map((item) => item.description),
      );

      await this.prisma.$transaction(async (tx) => {
        await tx.document.update({
          where: { id: documentId },
          data: { status: 'PROCESSED', errorMessage: null },
        });
        if (toCreate.length > 0) {
          await tx.transaction.createMany({
            data: toCreate.map((item, index) => ({
              familyId,
              accountId,
              documentId,
              date: new Date(`${item.date}T12:00:00.000Z`),
              description: item.description,
              amount: item.amount,
              type: item.type,
              status: TransactionStatus.PENDING,
              source: TransactionSource.IMPORT,
              externalId: item.externalId ?? null,
              paymentMethod: item.paymentMethod ?? null,
              suggestedCategoryId: suggestedCategoryIds[index] ?? null,
            })),
          });
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao processar o arquivo';
      await this.prisma.document
        .update({
          where: { id: documentId },
          data: { status: 'FAILED', errorMessage: message },
        })
        .catch(() => undefined);
      throw error;
    }
  }

  async list(user: AuthUser): Promise<ImportRecord[]> {
    const documents = await this.prisma.document.findMany({
      where: { familyId: user.familyId },
      select: DOCUMENT_SELECT,
      orderBy: { createdAt: 'desc' },
    });
    const counts = await this.prisma.transaction.groupBy({
      by: ['documentId'],
      where: { familyId: user.familyId, deletedAt: null, documentId: { not: null } },
      _count: { documentId: true },
    });
    const countByDoc = new Map(counts.map((row) => [row.documentId, row._count.documentId]));
    return documents.map((document) => ({
      ...document,
      transactionCount: countByDoc.get(document.id) ?? 0,
    }));
  }

  async getById(user: AuthUser, id: string): Promise<ImportDetail> {
    const document = await this.prisma.document.findFirst({
      where: { id, familyId: user.familyId },
      select: { ...DOCUMENT_SELECT, storageKey: true },
    });
    if (!document) {
      throw new NotFoundException('Importação não encontrada');
    }
    const transactions = await this.prisma.transaction.findMany({
      where: { documentId: id, deletedAt: null },
      select: {
        id: true,
        date: true,
        description: true,
        amount: true,
        type: true,
        status: true,
      },
      orderBy: { date: 'desc' },
    });
    const { storageKey: _storageKey, ...record } = document;
    return { ...record, transactionCount: transactions.length, transactions };
  }

  private async ensureAccount(user: AuthUser, accountId: string): Promise<void> {
    const account = await this.prisma.account.findFirst({
      where: { id: accountId, familyId: user.familyId },
    });
    if (!account) {
      throw new BadRequestException('Conta não encontrada');
    }
  }

  private async findExistingKeys(familyId: string, accountId: string): Promise<Set<string>> {
    const rows = await this.prisma.transaction.findMany({
      where: { familyId, accountId, deletedAt: null },
      select: { externalId: true, date: true, amount: true, description: true },
    });
    const keys = new Set<string>();
    for (const row of rows) {
      if (row.externalId) {
        keys.add(`e:${row.externalId}`);
      }
      keys.add(
        `k:${row.date.toISOString().slice(0, 10)}:${Math.abs(Number(row.amount))}:${normalizeDescription(row.description)}`,
      );
    }
    return keys;
  }

  private txKey(tx: ParsedTransaction): string {
    if (tx.externalId) {
      return `e:${tx.externalId}`;
    }
    return `k:${tx.date}:${Math.abs(Number(tx.amount))}:${tx.description}`;
  }
}
