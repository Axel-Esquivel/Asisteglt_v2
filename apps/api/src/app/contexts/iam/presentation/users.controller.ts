import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { SessionResponse, UserResponse } from '@asisteglt/shared-contracts';
import { EntityId } from '@asisteglt/shared-kernel';
import { CurrentPrincipal } from '../../../common/auth/auth.decorators';
import { AccountService } from '../application/account.use-cases';
import { UserDirectory } from '../application/user-directory';
import { AuthenticatedPrincipal } from '../domain/ports';
import { Session } from '../domain/session';
import { ChangePasswordRequestDto, UpdateProfileRequestDto } from './dto/auth.dto';
import { IamPresenter } from './iam.presenter';

@Controller('users')
export class UsersController {
  public constructor(
    private readonly accounts: AccountService,
    private readonly directory: UserDirectory,
  ) {}

  @Patch('me')
  public async updateProfile(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() body: UpdateProfileRequestDto,
  ): Promise<UserResponse> {
    return IamPresenter.user((await this.accounts.rename(principal, body.displayName)).unwrap());
  }

  @Post('me/password')
  @HttpCode(HttpStatus.NO_CONTENT)
  public async changePassword(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() body: ChangePasswordRequestDto,
  ): Promise<void> {
    (await this.accounts.changePassword(principal, body.currentPassword, body.newPassword)).unwrap();
  }

  @Get('me/sessions')
  public async sessions(@CurrentPrincipal() principal: AuthenticatedPrincipal): Promise<SessionResponse[]> {
    return (await this.accounts.activeSessions(principal)).map(
      (session: Session): SessionResponse => IamPresenter.activeSession(session, principal.sessionId),
    );
  }

  @Delete('me/sessions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  public async revoke(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('id') id: string): Promise<void> {
    (await this.accounts.revokeSession(principal, EntityId.fromString(id).unwrap())).unwrap();
  }

  @Get('search')
  public async search(@Query('q') query: string): Promise<UserResponse[]> {
    return (await this.directory.search(typeof query === 'string' ? query : '')).map(IamPresenter.user);
  }
}
