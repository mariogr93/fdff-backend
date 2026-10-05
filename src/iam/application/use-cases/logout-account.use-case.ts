import { Inject, Injectable } from '@nestjs/common';
import { hashRefreshToken } from '../../infrastructure/security/refresh-token.util';
import {
  I_ACCOUNT_REPOSITORY,
  type IAccountRepository,
} from '../ports/account.repository.interface';

@Injectable()
export class LogoutAccountUseCase {
  constructor(
    @Inject(I_ACCOUNT_REPOSITORY)
    private readonly accountRepo: IAccountRepository,
  ) {}

  async execute(plainRefreshToken: string | null | undefined): Promise<void> {
    if (!plainRefreshToken) {
      return;
    }

    const refreshTokenHash = hashRefreshToken(plainRefreshToken);
    const account =
      await this.accountRepo.findByRefreshTokenHash(refreshTokenHash);
    if (!account) {
      return;
    }

    await this.accountRepo.update(account.clearRefreshToken());
  }
}
