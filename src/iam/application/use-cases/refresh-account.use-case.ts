import { Inject, Injectable } from '@nestjs/common';
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
    const tokenHash = this.refreshTokens.hash(plainRefreshToken);
    const account = await this.accountRepo.findByRefreshTokenHash(tokenHash);

    // One opaque error for every failure. Unlike login, this must not
    // distinguish "no such token" from "account not active", or it becomes a
    // way to probe account state with a stolen cookie.
    if (!account || !account.isActive()) {
      throw new InvalidRefreshTokenException();
    }

    const newRefreshToken = this.refreshTokens.generate();
    const expiresAt = new Date(Date.now() + this.policy.refreshTokenTtlMs);

    await this.accountRepo.update(
      account.withRefreshToken(
        this.refreshTokens.hash(newRefreshToken),
        expiresAt,
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
