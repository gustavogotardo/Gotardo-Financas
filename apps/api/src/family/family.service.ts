import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FamilyRole } from '@gotardo/db';
import { PrismaService } from '../prisma/prisma.module';
import type { AuthUser } from '../common/auth-user';
import { randomToken } from '../common/tokens';
import type { CreateInvitationDto } from './dto/create-invitation.dto';
import type { ChangeRoleDto } from './dto/change-role.dto';

const PUBLIC_USER_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  createdAt: true,
} as const;

const INVITATION_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class FamilyService {
  constructor(private readonly prisma: PrismaService) {}

  async getFamily(user: AuthUser) {
    const family = await this.prisma.family.findUnique({
      where: { id: user.familyId },
      include: {
        users: { select: PUBLIC_USER_SELECT, orderBy: { createdAt: 'asc' as const } },
        invitations: {
          where: { acceptedAt: null },
          select: { id: true, email: true, role: true, expiresAt: true, createdAt: true },
          orderBy: { createdAt: 'desc' as const },
        },
      },
    });
    if (!family) {
      throw new NotFoundException('Família não encontrada');
    }
    return family;
  }

  async createInvitation(user: AuthUser, dto: CreateInvitationDto) {
    if (user.role !== FamilyRole.OWNER && user.role !== FamilyRole.ADMIN) {
      throw new ForbiddenException('Somente OWNER/ADMIN podem convidar');
    }
    const role = dto.role ?? FamilyRole.MEMBER;
    if (role === FamilyRole.OWNER && user.role !== FamilyRole.OWNER) {
      throw new ForbiddenException('Somente o OWNER pode convidar como OWNER');
    }
    const email = dto.email.toLowerCase();
    const existingMember = await this.prisma.user.findFirst({
      where: { email, familyId: user.familyId },
    });
    if (existingMember) {
      throw new ConflictException('Email já é membro da família');
    }
    const pending = await this.prisma.invitation.findFirst({
      where: { email, familyId: user.familyId, acceptedAt: null },
    });
    if (pending) {
      throw new ConflictException('Convite pendente para este email');
    }
    const token = randomToken(32);
    const invitation = await this.prisma.invitation.create({
      data: {
        familyId: user.familyId,
        email,
        role,
        token,
        createdBy: user.id,
        expiresAt: new Date(Date.now() + INVITATION_EXPIRY_MS),
      },
      select: { id: true, email: true, role: true, expiresAt: true, createdAt: true },
    });
    return { ...invitation, inviteToken: token };
  }

  async listInvitations(user: AuthUser) {
    if (user.role !== FamilyRole.OWNER && user.role !== FamilyRole.ADMIN) {
      throw new ForbiddenException();
    }
    return this.prisma.invitation.findMany({
      where: { familyId: user.familyId, acceptedAt: null },
      select: { id: true, email: true, role: true, expiresAt: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async revokeInvitation(user: AuthUser, invitationId: string) {
    if (user.role !== FamilyRole.OWNER && user.role !== FamilyRole.ADMIN) {
      throw new ForbiddenException();
    }
    const invitation = await this.prisma.invitation.findFirst({
      where: { id: invitationId, familyId: user.familyId },
    });
    if (!invitation) {
      throw new NotFoundException('Convite não encontrado');
    }
    await this.prisma.invitation.delete({ where: { id: invitationId } });
  }

  async changeRole(user: AuthUser, memberId: string, dto: ChangeRoleDto) {
    if (user.role !== FamilyRole.OWNER && user.role !== FamilyRole.ADMIN) {
      throw new ForbiddenException();
    }
    const member = await this.prisma.user.findFirst({
      where: { id: memberId, familyId: user.familyId },
    });
    if (!member) {
      throw new NotFoundException('Membro não encontrado');
    }
    if (member.role === FamilyRole.OWNER && user.role !== FamilyRole.OWNER) {
      throw new ForbiddenException('Somente o OWNER altera outro OWNER');
    }
    if (dto.role === FamilyRole.OWNER && user.role !== FamilyRole.OWNER) {
      throw new ForbiddenException('Somente o OWNER pode conceder o papel OWNER');
    }
    if (member.role === FamilyRole.OWNER && dto.role !== FamilyRole.OWNER) {
      const owners = await this.prisma.user.count({
        where: { familyId: user.familyId, role: FamilyRole.OWNER },
      });
      if (owners <= 1) {
        throw new ConflictException('A família precisa de ao menos um OWNER');
      }
    }
    return this.prisma.user.update({
      where: { id: memberId },
      data: { role: dto.role },
      select: PUBLIC_USER_SELECT,
    });
  }
}
