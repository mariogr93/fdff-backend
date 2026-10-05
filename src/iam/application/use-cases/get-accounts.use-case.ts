import { Inject, Injectable } from '@nestjs/common';
import {
  type IAccountRepository,
  I_ACCOUNT_REPOSITORY,
} from '../ports/account.repository.interface';
import { Account } from '../../domain/account.model';

@Injectable()
export class GetAccountsUseCase {
  constructor(
    @Inject(I_ACCOUNT_REPOSITORY)
    private readonly accountRepo: IAccountRepository,
  ) {}

  async execute(): Promise<Account[]> {
    return this.accountRepo.findAll();
  }
}
