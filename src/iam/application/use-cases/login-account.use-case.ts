import { Inject, Injectable } from '@nestjs/common';
import { AccountLockedException } from '../../domain/exceptions/account-locked.exception';
import { AccountNotActivatedException } from '../../domain/exceptions/account-not-activated.exception';
import { InvalidCredentialsException } from '../../domain/exceptions/invalid-credentials.exception';
import {
  generateRefreshToken,
  hashRefreshToken,
} from '../../infrastructure/security/refresh-token.util';
import { type AuthPolicy, I_AUTH_POLICY } from '../ports/auth-policy';
import {
  I_ACCOUNT_REPOSITORY,
  type IAccountRepository,
} from '../ports/account.repository.interface';
import {
  I_PASSWORD_HASHER,
  type IPasswordHasherPort,
} from '../ports/password-hasher.port';
import {
  type ITokenServicePort,
  I_TOKEN_SERVICE,
} from '../ports/token.service.port';

/** Precomputed bcrypt hash used when the email is unknown (timing-safe login). */
const DUMMY_HASH =
  '$2b$10$rgxcUa.Y5EjZdl9P46KgfOykqygbBW0ktqYw2hYclfvoGluFSICDm';

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
  constructor(
    @Inject(I_ACCOUNT_REPOSITORY)
    private readonly accountRepo: IAccountRepository,
    @Inject(I_PASSWORD_HASHER)
    private readonly passwordHasher: IPasswordHasherPort,
    @Inject(I_TOKEN_SERVICE)
    private readonly tokenService: ITokenServicePort,
    @Inject(I_AUTH_POLICY)
    private readonly policy: AuthPolicy,
  ) {}

  async execute(command: ILoginCommand): Promise<IAuthResult> {
    const now = new Date();
    const account = await this.accountRepo.findByEmail(command.email);

    // Deliberately before the password check, as it has always been: a locked
    // account short-circuits without running bcrypt. That is a timing signal
    // which partly undercuts the DUMMY_HASH defence below, and is a known
    // trade-off rather than an oversight — see docs/PROD-Security-gaps.md.
    if (account?.isLocked(now)) {
      throw new AccountLockedException();
    }

    // Always spend the cost of a bcrypt comparison, even for an unknown email,
    // so response time does not reveal whether the account exists.
    const isPasswordValid = account
      ? await this.passwordHasher.compare(
          command.plainPassword,
          account.passwordHash,
        )
      : await this.passwordHasher
          .compare(command.plainPassword, DUMMY_HASH)
          .then(() => false);

    if (!account || !isPasswordValid) {
      if (account) {
        await this.accountRepo.update(
          account.registerFailedLogin(this.policy.lockout, now),
        );
      }
      throw new InvalidCredentialsException();
    }

    // Credentials are good, so the failed-attempt counter is cleared on every
    // path from here — including the rejection below, which is why it is
    // persisted before the status check rather than after.
    if (!account.isActive()) {
      await this.accountRepo.update(account.clearLoginAttempts());
      throw new AccountNotActivatedException();
    }

    const refreshToken = generateRefreshToken();
    await this.accountRepo.update(
      account
        .clearLoginAttempts()
        .withRefreshToken(hashRefreshToken(refreshToken)),
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
}
