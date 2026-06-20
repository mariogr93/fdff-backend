import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Account } from '../../domain/account.model';
import { AccountStatus } from '../../domain/enums/account-status.enum';
import { AccountLockedException } from '../../domain/exceptions/account-locked.exception';
import { AccountNotApprovedException } from '../../domain/exceptions/account-not-approved.exception';
import { InvalidCredentialsException } from '../../domain/exceptions/invalid-credentials.exception';
import {
  generateRefreshToken,
  hashRefreshToken,
} from '../../infrastructure/security/refresh-token.util';
import {
  I_ACCOUNT_REPOSITORY,
  type IAccountRepository,
} from '../ports/account.repository.interface';
import {
  I_PASSWORD_HASHER,
  type IPasswordHasherPort,
} from '../ports/password-hasher.port';
import { type ITokenServicePort, I_TOKEN_SERVICE } from '../ports/token.service.port';

/** Precomputed bcrypt hash used when the email is unknown (timing-safe login). */
const DUMMY_HASH =
  '$2b$10$rgxcUa.Y5EjZdl9P46KgfOykqygbBW0ktqYw2hYclfvoGluFSICDm';

const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;
const DEFAULT_REFRESH_TOKEN_DAYS = 7;

export interface ILoginCommand {
  email: string;
  plainPassword: string;
}

export interface IAuthResult {
  accessToken: string;
  /** Plain refresh token — controller sets HttpOnly cookie; never return in JSON. */
  refreshToken: string;
  accountId: string;
  role: string;
}

@Injectable()
export class LoginAccountUseCase {
  private readonly refreshTokenMaxAgeMs: number;

  constructor(
    @Inject(I_ACCOUNT_REPOSITORY)
    private readonly accountRepo: IAccountRepository,
    @Inject(I_PASSWORD_HASHER)
    private readonly passwordHasher: IPasswordHasherPort,
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

  async execute(command: ILoginCommand): Promise<IAuthResult> {
    const account = await this.accountRepo.findByEmail(command.email);

    if (account?.lockedUntil && account.lockedUntil > new Date()) {
      throw new AccountLockedException();
    }

    let isPasswordValid = false;

    if (account) {
      isPasswordValid = await this.passwordHasher.compare(
        command.plainPassword,
        account.passwordHash,
      );
    } else {
      await this.passwordHasher.compare(command.plainPassword, DUMMY_HASH);
    }

    if (!account || !isPasswordValid) {
      if (account) {
        await this.recordFailedLogin(account);
      }
      throw new InvalidCredentialsException();
    }

    await this.resetLoginAttempts(account);

    if (account.status !== AccountStatus.APPROVED) {
      throw new AccountNotApprovedException();
    }

    const refreshToken = generateRefreshToken();
    const refreshTokenHash = hashRefreshToken(refreshToken);

    await this.accountRepo.update(
      new Account(
        account.id,
        account.email,
        account.passwordHash,
        account.role,
        account.status,
        0,
        null,
        refreshTokenHash,
      ),
    );

    const { accessToken } = await this.tokenService.sign({
      id: account.id,
      email: account.email,
    });

    return {
      accessToken,
      refreshToken,
      accountId: account.id,
      role: account.role.toString(),
    };
  }

  private async recordFailedLogin(account: Account): Promise<void> {
    const failedLoginAttempts = account.failedLoginAttempts + 1;
    const lockedUntil =
      failedLoginAttempts >= MAX_FAILED_LOGIN_ATTEMPTS
        ? new Date(Date.now() + LOCKOUT_DURATION_MS)
        : account.lockedUntil;

    await this.accountRepo.update(
      new Account(
        account.id,
        account.email,
        account.passwordHash,
        account.role,
        account.status,
        failedLoginAttempts,
        lockedUntil,
        account.refreshTokenHash,
      ),
    );
  }

  private async resetLoginAttempts(account: Account): Promise<void> {
    if (account.failedLoginAttempts === 0 && account.lockedUntil === null) {
      return;
    }

    await this.accountRepo.update(
      new Account(
        account.id,
        account.email,
        account.passwordHash,
        account.role,
        account.status,
        0,
        null,
        account.refreshTokenHash,
      ),
    );
  }
}
