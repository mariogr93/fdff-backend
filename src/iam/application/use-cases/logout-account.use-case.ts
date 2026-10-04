import { Inject, Injectable } from '@nestjs/common';
import { Account } from '../../domain/account.model';
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
  ) { }

  async execute(plainRefreshToken: string | null | undefined): Promise<void> {
    if (!plainRefreshToken) {
      return;
    }

    const refreshTokenHash = hashRefreshToken(plainRefreshToken);
    const account = await this.accountRepo.findByRefreshTokenHash(refreshTokenHash);
    if (!account) {
      return;
    }

    await this.accountRepo.update(
      new Account(
        account.id,
        account.email,
        account.passwordHash,
        account.role,
        account.status,
        account.failedLoginAttempts,
        account.lockedUntil,
        null, // clear refresh_token_hash
      ),
    );
  }
}
