import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { FamilyService } from './family.service';
import type { AuthUser } from '../common/auth-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { ChangeRoleDto } from './dto/change-role.dto';

@Controller('family')
export class FamilyController {
  constructor(private readonly family: FamilyService) {}

  @Get()
  getFamily(@CurrentUser() user: AuthUser) {
    return this.family.getFamily(user);
  }

  @Post('invitations')
  createInvitation(@CurrentUser() user: AuthUser, @Body() dto: CreateInvitationDto) {
    return this.family.createInvitation(user, dto);
  }

  @Get('invitations')
  listInvitations(@CurrentUser() user: AuthUser) {
    return this.family.listInvitations(user);
  }

  @Delete('invitations/:id')
  @HttpCode(204)
  async revokeInvitation(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<void> {
    await this.family.revokeInvitation(user, id);
  }

  @Patch('members/:userId/role')
  changeRole(
    @CurrentUser() user: AuthUser,
    @Param('userId') userId: string,
    @Body() dto: ChangeRoleDto,
  ) {
    return this.family.changeRole(user, userId, dto);
  }
}
