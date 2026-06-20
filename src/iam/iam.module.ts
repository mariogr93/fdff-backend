import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtSignOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RegisterRoleGuard } from '../shared/guards/register-role.guard';
import { I_ACCOUNT_REPOSITORY } from './application/ports/account.repository.interface';
import { I_PASSWORD_HASHER } from './application/ports/password-hasher.port';
import { I_TOKEN_SERVICE } from './application/ports/token.service.port';
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
  controllers: [AuthController],
  providers: [
    JwtStrategy,
    RegisterRoleGuard,
    RegisterAccountUseCase,
    LoginAccountUseCase,
    RefreshAccountUseCase,
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
  exports: [RegisterAccountUseCase, LoginAccountUseCase],
})
export class IamModule {}
