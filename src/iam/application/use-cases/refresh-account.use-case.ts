import { Inject, Injectable, Logger } from '@nestjs/common';
import { InvalidRefreshTokenException } from '../../domain/exceptions/invalid-refresh-token.exception';
import { type AuthPolicy, I_AUTH_POLICY } from '../ports/auth-policy';
import {
  I_ACCOUNT_REPOSITORY,
  type IAccountRepository,
} from '../ports/account.repository.interface';
import {
  I_REFRESH_TOKEN_SERVICE,
  type IRefreshTokenServicePort,
} from '../ports/refresh-token.port';
import {
  type ITokenServicePort,
  I_TOKEN_SERVICE,
} from '../ports/token.service.port';

export interface IRefreshResult {
  accessToken: string;
  refreshToken: string;
  accountId: string;
  role: string;
}

@Injectable()
export class RefreshAccountUseCase {
  private readonly logger = new Logger(RefreshAccountUseCase.name);

  constructor(
    @Inject(I_ACCOUNT_REPOSITORY)
    private readonly accountRepo: IAccountRepository,
    @Inject(I_TOKEN_SERVICE)
    private readonly tokenService: ITokenServicePort,
    @Inject(I_REFRESH_TOKEN_SERVICE)
    private readonly refreshTokens: IRefreshTokenServicePort,
    @Inject(I_AUTH_POLICY)
    private readonly policy: AuthPolicy,
  ) {}

  async execute(plainRefreshToken: string): Promise<IRefreshResult> {
    const now = new Date();
    const tokenHash = this.refreshTokens.hash(plainRefreshToken);
    const account = await this.accountRepo.findByRefreshTokenHash(tokenHash);

    if (!account) {
      await this.endSessionIfReused(tokenHash);
      throw new InvalidRefreshTokenException();
    }

    // One opaque error for every failure: unknown token, expired token,
    // inactive account, lost race. Unlike login, this must not let a stolen
    // cookie tell those apart, or it becomes a way to probe account state.
    if (!account.isActive() || !account.hasLiveRefreshToken(now)) {
      throw new InvalidRefreshTokenException();
    }

    const newRefreshToken = this.refreshTokens.generate();
    const rotated = account.rotateRefreshToken(
      this.refreshTokens.hash(newRefreshToken),
      new Date(now.getTime() + this.policy.refreshTokenTtlMs),
    );

    // Single-use: the write only lands if the stored hash is still the one we
    // read. Of two simultaneous refreshes with one cookie, exactly one wins.
    const won = await this.accountRepo.updateIfRefreshTokenHashIs(
      rotated,
      tokenHash,
    );
    if (!won) {
      throw new InvalidRefreshTokenException();
    }

    const { accessToken } = await this.tokenService.sign({
      id: account.id,
      email: account.email,
      tokenVersion: account.tokenVersion,
    });

    return {
      accessToken,
      refreshToken: newRefreshToken,
      accountId: account.id,
      role: account.role.toString(),
    };
  }

  /**
   * A token that no account holds now, but that an account held just before its
   * latest rotation, was replaced and then presented again: the thief or the
   * real user is replaying it. Ending the session forces a fresh login, so
   * whoever holds the newest token loses it too. The caller still answers with
   * the same opaque 401 either way.
   */
  private async endSessionIfReused(tokenHash: string): Promise<void> {
    const reused =
      await this.accountRepo.findByPreviousRefreshTokenHash(tokenHash);
    if (!reused) {
      return;
    }

    await this.accountRepo.update(reused.clearRefreshToken());
    // Account id only: never the token or its hash.
    this.logger.warn(
      `Refresh token reuse detected for account ${reused.id}; session ended.`,
    );
  }
}
