import { DynamicModule, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AccessTokenGuard } from '../../common/auth/access-token.guard';
import { DataStore } from '../../common/persistence/data-store';
import { RepositoryBinding } from '../../common/persistence/persistence.module';
import { AppConfig } from '../../config/app-config';
import { AccountService } from './application/account.use-cases';
import {
  LoginUseCase,
  LogoutUseCase,
  RefreshSessionUseCase,
  RegisterUserUseCase,
} from './application/auth.use-cases';
import { IamSettings } from './application/iam-settings';
import { SessionIssuer } from './application/session-issuer';
import { UserDirectory } from './application/user-directory';
import {
  AccessTokenIssuer,
  OpaqueTokenService,
  PasswordHasher,
  SessionRepository,
  UserRepository,
} from './domain/ports';
import {
  InMemorySessionRepository,
  InMemoryUserRepository,
} from './infrastructure/memory/in-memory-iam.repositories';
import { MongoSessionRepository, MongoUserRepository } from './infrastructure/mongo/mongo-iam.repositories';
import {
  AccessTokenSettings,
  Argon2PasswordHasher,
  CryptoOpaqueTokenService,
  JwtAccessTokenIssuer,
} from './infrastructure/security.adapters';
import { AuthController } from './presentation/auth.controller';
import { UsersController } from './presentation/users.controller';

/** Contexto de identidad: usuarios, sesiones, tokens y guard global de autenticación. */
@Module({})
export class IamModule {
  public static register(store: DataStore): DynamicModule {
    return {
      module: IamModule,
      global: true,
      imports: [JwtModule.register({})],
      controllers: [AuthController, UsersController],
      providers: [
        RepositoryBinding.bind(UserRepository, store, InMemoryUserRepository, MongoUserRepository),
        RepositoryBinding.bind(SessionRepository, store, InMemorySessionRepository, MongoSessionRepository),
        { provide: PasswordHasher, useClass: Argon2PasswordHasher },
        { provide: OpaqueTokenService, useClass: CryptoOpaqueTokenService },
        { provide: AccessTokenIssuer, useClass: JwtAccessTokenIssuer },
        {
          provide: AccessTokenSettings,
          useFactory: (config: AppConfig): AccessTokenSettings =>
            new AccessTokenSettings(config.jwtSecret, config.accessTokenTtlSeconds),
          inject: [AppConfig],
        },
        {
          provide: IamSettings,
          useFactory: (config: AppConfig): IamSettings =>
            new IamSettings(config.refreshTokenTtlDays * 24 * 60 * 60 * 1000, config.secureCookies),
          inject: [AppConfig],
        },
        SessionIssuer,
        RegisterUserUseCase,
        LoginUseCase,
        RefreshSessionUseCase,
        LogoutUseCase,
        AccountService,
        UserDirectory,
        { provide: APP_GUARD, useClass: AccessTokenGuard },
      ],
      exports: [AccessTokenIssuer, AccountService, UserDirectory, OpaqueTokenService, RegisterUserUseCase],
    };
  }
}
