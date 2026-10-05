import { Inject, Injectable } from '@nestjs/common';
import {
  generateRefreshToken,
  hashRefreshToken,
} from '../../infrastructure/security/refresh-token.util';
import { InvalidRefreshTokenException } from '../../domain/exceptions/invalid-refresh-token.exception';
import {
  I_ACCOUNT_REPOSITORY,
  type IAccountRepository,
} from '../ports/account.repository.interface';
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
  ) {}

  async execute(plainRefreshToken: string): Promise<IRefreshResult> {
    const tokenHash = hashRefreshToken(plainRefreshToken);
    const account = await this.accountRepo.findByRefreshTokenHash(tokenHash);

    // One opaque error for every failure. Unlike login, this must not
    // distinguish "no such token" from "account not active", or it becomes a
    // way to probe account state with a stolen cookie.
    if (!account || !account.isActive()) {
      throw new InvalidRefreshTokenException();
    }

    const newRefreshToken = generateRefreshToken();

    await this.accountRepo.update(
      account.withRefreshToken(hashRefreshToken(newRefreshToken)),
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
