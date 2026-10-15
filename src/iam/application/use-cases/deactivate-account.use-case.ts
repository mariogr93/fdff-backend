import { Inject, Injectable } from '@nestjs/common';
import { AccountStatus } from '../../domain/enums/account-status.enum';
import { UserRoles } from '../../domain/enums/user-roles.enums';
import { LastAdminException } from '../../domain/exceptions/last-admin.exception';
import { CannotDeactivateOwnAccountException } from '../../domain/exceptions/cannot-deactivate-own-account.exception';
import { AccountNotFoundException } from '../../domain/exceptions/account-not-found.exception';
import {
  I_ACCOUNT_REPOSITORY,
  type IAccountRepository,
} from '../ports/account.repository.interface';

export interface DeactivateAccountCommand {
  accountId: string;
  /** The signed-in admin performing the action. */
  actorId: string;
}

@Injectable()
export class DeactivateAccountUseCase {
  constructor(
    @Inject(I_ACCOUNT_REPOSITORY)
    private readonly accountRepo: IAccountRepository,
  ) {}

  /**
   * Rules that need more than the account itself belong here rather than in
   * the entity, since they require the acting user or a repository count.
   * Both are enforced: you cannot deactivate yourself, and the last active
   * ADMIN cannot be deactivated. The count is not atomic with the write, so
   * two admins deactivating each other in the same instant could still leave
   * none; that case is accepted rather than closed with a lock.
   */
  async execute(command: DeactivateAccountCommand): Promise<void> {
    if (command.actorId === command.accountId) {
      throw new CannotDeactivateOwnAccountException();
    }

    const account = await this.accountRepo.findById(command.accountId);

    if (!account) {
      throw new AccountNotFoundException();
    }

    if (account.role === UserRoles.ADMIN && account.isActive()) {
      const activeAdmins = await this.accountRepo.countByRoleAndStatus(
        UserRoles.ADMIN,
        AccountStatus.ACTIVE,
      );
      if (activeAdmins <= 1) {
        throw new LastAdminException();
      }
    }

    await this.accountRepo.update(account.deactivate());
  }
}
