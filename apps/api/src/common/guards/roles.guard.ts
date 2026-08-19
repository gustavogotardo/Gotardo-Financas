import { Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ExecutionContext, CanActivate } from '@nestjs/common';
import type { FamilyRole } from '@gotardo/db';
import type { AuthUser } from '../auth-user';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<FamilyRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) {
      return true;
    }
    const request = context.switchToHttp().getRequest<{ user: AuthUser }>();
    return required.includes(request.user.role);
  }
}
