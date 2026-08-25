import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { Prisma, type User } from '@gotardo/db';
import { PrismaService } from '../prisma/prisma.module';
import type { JwtPayload } from '../common/auth-user';
import { parseDuration, randomToken, sha256 } from '../common/tokens';
import type { RegisterDto } from './dto/register.dto';
import type { LoginDto } from './dto/login.dto';
import type { AcceptInvitationDto } from './dto/accept-invitation.dto';

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
};

type IssuedTokens = AuthTokens & { refreshTokenId: string };

const PUBLIC_USER_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  familyId: true,
  createdAt: true,
} as const;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthTokens> {
    const email = dto.email.toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('Email já cadastrado');
    }
    const passwordHash = await argon2.hash(dto.password);
    try {
      const user = await this.prisma.user.create({
        data: {
          email,
          name: dto.name,
          passwordHash,
          role: 'OWNER',
          family: { create: { name: dto.familyName } },
        },
      });
      return this.issueTokens(user);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Email já cadastrado');
      }
      throw error;
    }
  }

  async login(dto: LoginDto): Promise<AuthTokens> {
    const email = dto.email.toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !(await argon2.verify(user.passwordHash, dto.password))) {
      throw new UnauthorizedException('Credenciais inválidas');
    }
    return this.issueTokens(user);
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    const tokenHash = sha256(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    if (!stored) {
      throw new UnauthorizedException('Token inválido');
    }
    if (stored.revokedAt || stored.replacedById) {
      throw new UnauthorizedException('Token inválido');
    }
    if (stored.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Token expirado');
    }
    const tokens = await this.issueTokens(stored.user);
    const rotated = await this.prisma.refreshToken.updateMany({
      where: { id: stored.id, revokedAt: null, replacedById: null },
      data: { revokedAt: new Date(), replacedById: tokens.refreshTokenId },
    });
    if (rotated.count === 0) {
      throw new UnauthorizedException('Token inválido');
    }
    return tokens;
  }

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = sha256(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        ...PUBLIC_USER_SELECT,
        family: { select: { id: true, name: true, currency: true, createdAt: true } },
      },
    });
    if (!user) {
      throw new UnauthorizedException();
    }
    return user;
  }

  async acceptInvitation(dto: AcceptInvitationDto): Promise<AuthTokens> {
    const invitation = await this.prisma.invitation.findUnique({
      where: { tokenHash: sha256(dto.token) },
    });
    if (!invitation) {
      throw new UnauthorizedException('Convite inválido');
    }
    if (invitation.acceptedAt) {
      throw new ConflictException('Convite já utilizado');
    }
    if (invitation.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Convite expirado');
    }
    const email = invitation.email.toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('Email já cadastrado');
    }
    const passwordHash = await argon2.hash(dto.password);
    try {
      const user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            email,
            name: dto.name,
            passwordHash,
            role: invitation.role,
            familyId: invitation.familyId,
          },
        });
        await tx.invitation.update({
          where: { id: invitation.id },
          data: { acceptedAt: new Date() },
        });
        return created;
      });
      return this.issueTokens(user);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Email já cadastrado');
      }
      throw error;
    }
  }

  private async issueTokens(user: User): Promise<IssuedTokens> {
    const accessTtl = this.config.get<string>('JWT_ACCESS_TTL', '15m');
    const refreshTtl = this.config.get<string>('JWT_REFRESH_TTL', '30d');
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      familyId: user.familyId,
      role: user.role,
    };
    const accessToken = await this.jwt.signAsync(payload, { expiresIn: accessTtl });
    const refreshToken = randomToken(48);
    const refreshTokenId = (
      await this.prisma.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash: sha256(refreshToken),
          expiresAt: new Date(Date.now() + parseDuration(refreshTtl)),
        },
      })
    ).id;
    return { accessToken, refreshToken, refreshTokenId, expiresIn: parseDuration(accessTtl) };
  }
}
