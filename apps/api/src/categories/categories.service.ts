import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@gotardo/db';
import { PrismaService } from '../prisma/prisma.module';
import type { AuthUser } from '../common/auth-user';
import type { CreateCategoryDto } from './dto/create-category.dto';
import type { UpdateCategoryDto } from './dto/update-category.dto';

export type CategoryRecord = Prisma.CategoryGetPayload<true>;

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  list(user: AuthUser): Promise<CategoryRecord[]> {
    return this.prisma.category.findMany({
      where: { familyId: user.familyId },
      orderBy: { name: 'asc' },
    });
  }

  async create(user: AuthUser, dto: CreateCategoryDto): Promise<CategoryRecord> {
    await this.ensureParentInFamily(user, dto.parentId);
    return this.prisma.category.create({
      data: {
        name: dto.name,
        icon: dto.icon,
        parentId: dto.parentId,
        familyId: user.familyId,
      },
    });
  }

  async getById(user: AuthUser, id: string): Promise<CategoryRecord> {
    const category = await this.prisma.category.findFirst({
      where: { id, familyId: user.familyId },
    });
    if (!category) {
      throw new NotFoundException('Categoria não encontrada');
    }
    return category;
  }

  async update(user: AuthUser, id: string, dto: UpdateCategoryDto): Promise<CategoryRecord> {
    const category = await this.getById(user, id);
    if (dto.parentId !== undefined && dto.parentId !== null) {
      await this.ensureParentInFamily(user, dto.parentId);
      if (dto.parentId === category.id) {
        throw new BadRequestException('Uma categoria não pode ser pai de si mesma');
      }
      await this.assertNoCycle(category.id, dto.parentId);
    }
    return this.prisma.category.update({
      where: { id },
      data: { name: dto.name, icon: dto.icon, parentId: dto.parentId },
    });
  }

  async remove(user: AuthUser, id: string): Promise<void> {
    await this.getById(user, id);
    const childrenCount = await this.prisma.category.count({
      where: { parentId: id, familyId: user.familyId },
    });
    if (childrenCount > 0) {
      throw new ConflictException('Mova ou exclua as subcategorias primeiro');
    }
    try {
      await this.prisma.category.delete({ where: { id } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw new ConflictException('Mova as transações desta categoria primeiro');
      }
      throw error;
    }
  }

  private async ensureParentInFamily(user: AuthUser, parentId?: string | null): Promise<void> {
    if (!parentId) {
      return;
    }
    const parent = await this.prisma.category.findFirst({
      where: { id: parentId, familyId: user.familyId },
    });
    if (!parent) {
      throw new NotFoundException('Categoria pai não encontrada');
    }
  }

  private async assertNoCycle(categoryId: string, newParentId: string): Promise<void> {
    let current: string | null = newParentId;
    while (current) {
      if (current === categoryId) {
        throw new BadRequestException('Mover a categoria criaria um ciclo');
      }
      const node: { parentId: string | null } | null = await this.prisma.category.findUnique({
        where: { id: current },
        select: { parentId: true },
      });
      if (!node) {
        break;
      }
      current = node.parentId;
    }
  }
}
