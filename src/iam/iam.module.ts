import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtSignOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RegisterRoleGuard } from './presentation/guards/register-role.guard';
import { I_ACCOUNT_REPOSITORY } from './application/ports/account.repository.interface';
import {
  type AuthPolicy,
  I_AUTH_POLICY,
} from './application/ports/auth-policy';
import { DEFAULT_LOCKOUT_POLICY } from './domain/account.model';
import { I_PASSWORD_HASHER } from './application/ports/password-hasher.port';
import { I_TOKEN_SERVICE } from './application/ports/token.service.port';
import { GetAccountsUseCase } from './application/use-cases/get-accounts.use-case';
import { LoginAccountUseCase } from './application/use-cases/login-account.use-case';
import { RefreshAccountUseCase } from './application/use-cases/refresh-account.use-case';
import { RegisterAccountUseCase } from './application/use-cases/register-account.use-case';
import { AccountOrmEntity } from './infrastructure/persistence/account.orm-entity';
import { TypeOrmAccountRepository } from './infrastructure/persistence/typeorm-account.repository';
import { BcryptPasswordHasher } from './infrastructure/security/bcrypt-password-hasher';
import { loadJwtKeyPair } from './infrastructure/security/jwt-key.util';
import { JwtTokenService } from './infrastructure/security/jwt-token.service';
import { JwtStrategy } from './infrastructure/security/jwt.strategy';
import { AuthController } from './presentation/auth.controller';
import { AccountController } from './presentation/account.controller';
import { ActivateAccountUseCase } from './application/use-cases/activate-account.use-case';
import { DeactivateAccountUseCase } from './application/use-cases/deactivate-account.use-case';
import { RolesGuard } from './presentation/guards/roles.guard';
import { JwtAuthGuard } from './presentation/guards/jwt-auth.guard';
import { LogoutAccountUseCase } from './application/use-cases/logout-account.use-case';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    TypeOrmModule.forFeature([AccountOrmEntity]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const { privateKey, publicKey } = loadJwtKeyPair(config);

        return {
          privateKey,
          publicKey,
          signOptions: {
            algorithm: 'RS256',
            expiresIn: config.get<string>(
              'JWT_EXPIRES_IN',
              '15m',
            ) as JwtSignOptions['expiresIn'],
          },
        };
      },
    }),
  ],
  controllers: [AuthController, AccountController],
  providers: [
    JwtStrategy,
    RegisterRoleGuard,
    RolesGuard,
    JwtAuthGuard,
    RegisterAccountUseCase,
    LoginAccountUseCase,
    LogoutAccountUseCase,
    RefreshAccountUseCase,
    GetAccountsUseCase,
    ActivateAccountUseCase,
    DeactivateAccountUseCase,
    {
      // Every tunable auth value is resolved here, once. Previously
      // REFRESH_TOKEN_EXPIRES_DAYS was parsed separately in two use cases.
      provide: I_AUTH_POLICY,
      inject: [ConfigService],
      useFactory: (config: ConfigService): AuthPolicy => {
        const refreshDays = parseInt(
          config.get<string>('REFRESH_TOKEN_EXPIRES_DAYS', '7'),
          10,
        );

        return {
          refreshTokenTtlMs: refreshDays * 24 * 60 * 60 * 1000,
          lockout: DEFAULT_LOCKOUT_POLICY,
        };
      },
    },
    {
      provide: I_ACCOUNT_REPOSITORY,
      useClass: TypeOrmAccountRepository,
    },
    {
      provide: I_PASSWORD_HASHER,
      useClass: BcryptPasswordHasher,
    },
    {
      provide: I_TOKEN_SERVICE,
      useClass: JwtTokenService,
    },
  ],
  // Authorization belongs to IAM, so the guards are published here. Any future
  // slice that guards a route must import IamModule: JwtAuthGuard resolves the
  // 'jwt' strategy registered by this module's PassportModule.
  exports: [
    RegisterAccountUseCase,
    LoginAccountUseCase,
    JwtAuthGuard,
    RolesGuard,
  ],
})
export class IamModule {}
