import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthSessionResponse, UserResponse } from '@asisteglt/shared-contracts';
import { Nullable, Result } from '@asisteglt/shared-kernel';
import { CurrentPrincipal, Public } from '../../../common/auth/auth.decorators';
import { ClientInfo } from '../../../common/http/client-info';
import { RateLimitPolicies } from '../../../common/security/rate-limit';
import { RateLimited } from '../../../common/security/rate-limit.guard';
import { AccountService } from '../application/account.use-cases';
import {
  LoginUseCase,
  LogoutUseCase,
  RefreshSessionUseCase,
  RegisterUserUseCase,
} from '../application/auth.use-cases';
import { LoginCommand, RegisterCommand } from '../application/commands';
import { IamSettings } from '../application/iam-settings';
import { IssuedSession } from '../application/session-issuer';
import { IamErrors } from '../domain/iam-errors';
import { AuthenticatedPrincipal } from '../domain/ports';
import { DeviceInfo } from '../domain/session';
import { LoginRequestDto, RegisterRequestDto } from './dto/auth.dto';
import { IamPresenter } from './iam.presenter';
import { RefreshCookie } from './refresh-cookie';

@Controller('auth')
export class AuthController {
  public constructor(
    private readonly registerUser: RegisterUserUseCase,
    private readonly login: LoginUseCase,
    private readonly refresh: RefreshSessionUseCase,
    private readonly logout: LogoutUseCase,
    private readonly accounts: AccountService,
    private readonly settings: IamSettings,
  ) {}

  @Public()
  @RateLimited(RateLimitPolicies.REGISTER)
  @Post('register')
  public async register(
    @Body() body: RegisterRequestDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthSessionResponse> {
    const issued: Result<IssuedSession> = await this.registerUser.execute(
      new RegisterCommand(body.email, body.password, body.displayName),
      AuthController.device(request),
    );
    return this.respond(issued.unwrap(), response);
  }

  @Public()
  @RateLimited(RateLimitPolicies.LOGIN)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  public async signIn(
    @Body() body: LoginRequestDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthSessionResponse> {
    const issued: Result<IssuedSession> = await this.login.execute(
      new LoginCommand(body.email, body.password, AuthController.device(request)),
    );
    return this.respond(issued.unwrap(), response);
  }

  @Public()
  @RateLimited(RateLimitPolicies.REFRESH)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  public async renew(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthSessionResponse> {
    const token: Nullable<string> = RefreshCookie.read(request);
    if (token === null) {
      throw IamErrors.sessionExpired();
    }
    const issued: Result<IssuedSession> = await this.refresh.execute(token, ClientInfo.ipAddress(request));
    if (!issued.isOk()) {
      RefreshCookie.clear(response, this.settings);
    }
    return this.respond(issued.unwrap(), response);
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  public async signOut(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const token: Nullable<string> = RefreshCookie.read(request);
    if (token !== null) {
      await this.logout.execute(token, ClientInfo.ipAddress(request));
    }
    RefreshCookie.clear(response, this.settings);
  }

  @Get('me')
  public async me(@CurrentPrincipal() principal: AuthenticatedPrincipal): Promise<UserResponse> {
    return IamPresenter.user((await this.accounts.current(principal)).unwrap());
  }

  private respond(issued: IssuedSession, response: Response): AuthSessionResponse {
    RefreshCookie.write(response, issued.refreshToken, this.settings);
    return IamPresenter.session(issued);
  }

  private static device(request: Request): DeviceInfo {
    return new DeviceInfo(ClientInfo.userAgent(request), ClientInfo.ipAddress(request));
  }
}
