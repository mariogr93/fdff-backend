import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, ILike, Repository } from 'typeorm';
import {
  AccountsPage,
  IAccountRepository,
} from '../../application/ports/account.repository.interface';
import {
  AccountsQuery,
  AccountsSortOrder,
} from '../../application/ports/accounts-query';
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

  async findByRefreshTokenHash(hash: string): Promise<Account | null> {
    const row = await this.repository.findOne({
      where: { refreshTokenHash: hash },
    });
    return row ? this.toDomain(row) : null;
  }

  async save(account: Account): Promise<void> {
    await this.repository.save(this.toOrm(account));
  }

  async update(account: Account): Promise<void> {
    await this.repository.save(this.toOrm(account));
  }

  async findMany(query: AccountsQuery): Promise<AccountsPage> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;

    const where: FindOptionsWhere<AccountOrmEntity> = {};
    if (query.email) {
      where.email = ILike(`%${query.email}%`);
    }
    if (query.role) {
      where.role = query.role;
    }
    if (query.status) {
      where.status = query.status;
    }

    const [rows, total] = await this.repository.findAndCount({
      where,
      order: { createdAt: query.sortOrder ?? AccountsSortOrder.DESC },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { rows: rows.map((row) => this.toDomain(row)), total };
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
      row.refreshTokenHash,
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
    row.refreshTokenHash = account.refreshTokenHash;
    return row;
  }
}
