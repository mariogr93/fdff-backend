import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IAccountRepository } from '../../application/ports/account.repository.interface';
import { Account } from '../../domain/account.model';
import { AccountOrmEntity } from './account.orm-entity';

@Injectable()
export class TypeOrmAccountRepository implements IAccountRepository {
  constructor(
    @InjectRepository(AccountOrmEntity)
    private readonly repository: Repository<AccountOrmEntity>,
  ) {}

  async findById(id: string): Promise<Account | null> {
    const row = await this.repository.findOne({ where: { id } });
    return row ? this.toDomain(row) : null;
  }

  async findByEmail(email: string): Promise<Account | null> {
    const row = await this.repository.findOne({ where: { email } });
    return row ? this.toDomain(row) : null;
  }

  async save(account: Account): Promise<void> {
    await this.repository.save(this.toOrm(account));
  }

  async update(account: Account): Promise<void> {
    await this.repository.save(this.toOrm(account));
  }

  private toDomain(row: AccountOrmEntity): Account {
    return new Account(
      row.id,
      row.email,
      row.passwordHash,
      row.role,
      row.status,
      row.failedLoginAttempts,
      row.lockedUntil,
    );
  }

  private toOrm(account: Account): AccountOrmEntity {
    const row = new AccountOrmEntity();
    row.id = account.id;
    row.email = account.email;
    row.passwordHash = account.passwordHash;
    row.role = account.role;
    row.status = account.status;
    row.failedLoginAttempts = account.failedLoginAttempts;
    row.lockedUntil = account.lockedUntil;
    return row;
  }
}
