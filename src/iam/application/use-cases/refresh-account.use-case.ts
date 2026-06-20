import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  generateRefreshToken,
  hashRefreshToken,
} from '../../infrastructure/security/refresh-token.util';
import { AccountStatus } from '../../domain/enums/account-status.enum';
import { Account } from '../../domain/account.model';
import { InvalidRefreshTokenException } from '../../domain/exceptions/invalid-refresh-token.exception';
import {
  I_ACCOUNT_REPOSITORY,
  type IAccountRepository,
} from '../ports/account.repository.interface';
import { type ITokenServicePort, I_TOKEN_SERVICE } from '../ports/token.service.port';

const DEFAULT_REFRESH_TOKEN_DAYS = 7;

export interface IRefreshResult {
  accessToken: string;
  refreshToken: string;
  accountId: string;
  role: string;
}

@Injectable()
export class RefreshAccountUseCase {
  private readonly refreshTokenMaxAgeMs: number;

  constructor(
    @Inject(I_ACCOUNT_REPOSITORY)
    private readonly accountRepo: IAccountRepository,
    @Inject(I_TOKEN_SERVICE)
    private readonly tokenService: ITokenServicePort,
    config: ConfigService,
  ) {
    const refreshDays = parseInt(
      config.get<string>('REFRESH_TOKEN_EXPIRES_DAYS', String(DEFAULT_REFRESH_TOKEN_DAYS)),
      10,
    );
    this.refreshTokenMaxAgeMs = refreshDays * 24 * 60 * 60 * 1000;
  }

  get refreshTokenTtlMs(): number {
    return this.refreshTokenMaxAgeMs;
  }

  async execute(plainRefreshToken: string): Promise<IRefreshResult> {
    const tokenHash = hashRefreshToken(plainRefreshToken);
    const account = await this.accountRepo.findByRefreshTokenHash(tokenHash);

    if (!account || account.status !== AccountStatus.APPROVED) {
      throw new InvalidRefreshTokenException();
    }

    const newRefreshToken = generateRefreshToken();
    const newRefreshTokenHash = hashRefreshToken(newRefreshToken);

    await this.accountRepo.update(
      new Account(
        account.id,
        account.email,
        account.passwordHash,
        account.role,
        account.status,
        account.failedLoginAttempts,
        account.lockedUntil,
        newRefreshTokenHash,
      ),
    );

    const { accessToken } = await this.tokenService.sign({
      id: account.id,
      email: account.email,
    });

    return {
      accessToken,
      refreshToken: newRefreshToken,
      accountId: account.id,
      role: account.role.toString(),
    };
  }
}
