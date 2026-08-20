import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.module';
import { MlClient } from './ml.client';

@Injectable()
export class CategorySuggesterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ml: MlClient,
  ) {}

  /** Sugere a categoria de uma descrição, casando por nome na família. */
  async suggest(familyId: string, description: string): Promise<string | null> {
    if (!this.ml.enabled) {
      return null;
    }
    const suggestion = await this.ml.categorize(description, { familyId });
    return this.matchCategory(familyId, suggestion.category);
  }

  /** Sugere categorias para várias descrições da mesma família (na ordem). */
  async suggestMany(familyId: string, descriptions: string[]): Promise<Array<string | null>> {
    if (!this.ml.enabled || descriptions.length === 0) {
      return descriptions.map(() => null);
    }
    const results = await Promise.all(
      descriptions.map((description) => this.suggest(familyId, description)),
    );
    return results;
  }

  private async matchCategory(familyId: string, name: string | null): Promise<string | null> {
    if (!name) {
      return null;
    }
    const category = await this.prisma.category.findFirst({
      where: { familyId, name: { equals: name, mode: 'insensitive' } },
      select: { id: true },
    });
    return category?.id ?? null;
  }
}
