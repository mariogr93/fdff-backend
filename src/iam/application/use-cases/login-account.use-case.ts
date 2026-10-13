import { Inject, Injectable } from '@nestjs/common';
import { AccountLockedException } from '../../domain/exceptions/account-locked.exception';
import { AccountNotActivatedException } from '../../domain/exceptions/account-not-activated.exception';
import { InvalidCredentialsException } from '../../domain/exceptions/invalid-credentials.exception';
import { normalizeEmail } from '../../domain/normalize-email';
import { type AuthPolicy, I_AUTH_POLICY } from '../ports/auth-policy';
import {
  I_REFRESH_TOKEN_SERVICE,
  type IRefreshTokenServicePort,
} from '../ports/refresh-token.port';
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
    @Inject(I_REFRESH_TOKEN_SERVICE)
    private readonly refreshTokens: IRefreshTokenServicePort,
  ) {}

  private dummyHash?: Promise<string>;

  /**
   * A hash for emails that match no account, so they cost the same bcrypt work
   * as a real one. Built with the real hasher rather than hardcoded, so its
   * cost always follows SALT_ROUNDS. Built lazily and cached.
   */
  private getDummyHash(): Promise<string> {
    return (this.dummyHash ??= this.passwordHasher.hash('timing-equaliser'));
  }

  async execute(command: ILoginCommand): Promise<IAuthResult> {
    const now = new Date();
    const account = await this.accountRepo.findByEmail(
      normalizeEmail(command.email),
    );

    // Exactly one bcrypt comparison on every path, whether the email is
    // unknown, the account is locked, or the password is wrong, so response
    // time reveals nothing about which of those it was.
    const isPasswordValid = await this.passwordHasher.compare(
      command.plainPassword,
      account?.passwordHash ?? (await this.getDummyHash()),
    );

    // Only someone who knows the password learns the account is locked.
    // Everyone else gets the generic 401, and their guess is not counted: a
    // locked account must not have its lock extended by strangers.
    if (account?.isLocked(now)) {
      throw isPasswordValid
        ? new AccountLockedException()
        : new InvalidCredentialsException();
    }

    // `!account` is checked on its own: a password that happens to match the
    // dummy hash must never turn an unknown email into a login.
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

    const refreshToken = this.refreshTokens.generate();
    await this.accountRepo.update(
      account
        .clearLoginAttempts()
        .withRefreshToken(
          this.refreshTokens.hash(refreshToken),
          new Date(now.getTime() + this.policy.refreshTokenTtlMs),
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
}
