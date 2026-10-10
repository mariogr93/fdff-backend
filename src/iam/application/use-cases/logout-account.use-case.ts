import { Inject, Injectable } from '@nestjs/common';
import {
  I_ACCOUNT_REPOSITORY,
  type IAccountRepository,
} from '../ports/account.repository.interface';
import {
  I_REFRESH_TOKEN_SERVICE,
  type IRefreshTokenServicePort,
} from '../ports/refresh-token.port';

@Injectable()
export class LogoutAccountUseCase {
  constructor(
    @Inject(I_ACCOUNT_REPOSITORY)
    private readonly accountRepo: IAccountRepository,
    @Inject(I_REFRESH_TOKEN_SERVICE)
    private readonly refreshTokens: IRefreshTokenServicePort,
  ) {}

  async execute(plainRefreshToken: string | null | undefined): Promise<void> {
    if (!plainRefreshToken) {
      return;
    }

    const refreshTokenHash = this.refreshTokens.hash(plainRefreshToken);
    const account =
      await this.accountRepo.findByRefreshTokenHash(refreshTokenHash);
    if (!account) {
      return;
    }

    await this.accountRepo.update(account.clearRefreshToken());
  }
}
