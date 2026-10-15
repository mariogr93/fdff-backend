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
import { AccountStatus } from '../../domain/enums/account-status.enum';
import { UserRoles } from '../../domain/enums/user-roles.enums';
import { AccountAlreadyExistsException } from '../../domain/exceptions/account-already-exists.exception';
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

  async findByPreviousRefreshTokenHash(hash: string): Promise<Account | null> {
    const row = await this.repository.findOne({
      where: { previousRefreshTokenHash: hash },
    });
    return row ? this.toDomain(row) : null;
  }

  async save(account: Account): Promise<void> {
    try {
      await this.repository.insert(this.toOrm(account));
    } catch (error) {
      // 23505 = Postgres unique_violation. The id is a fresh UUID, so the only
      // constraint that can realistically fire is the unique email.
      const code = (error as { driverError?: { code?: string } }).driverError
        ?.code;
      if (code === '23505') {
        throw new AccountAlreadyExistsException(account.email);
      }
      throw error;
    }
  }

  async update(account: Account): Promise<void> {
    await this.repository.save(this.toOrm(account));
  }

  async updateIfRefreshTokenHashIs(
    account: Account,
    expectedHash: string,
  ): Promise<boolean> {
    const result = await this.repository.update(
      { id: account.id, refreshTokenHash: expectedHash },
      this.toOrm(account),
    );
    return result.affected === 1;
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

  countByRoleAndStatus(
    role: UserRoles,
    status: AccountStatus,
  ): Promise<number> {
    return this.repository.count({ where: { role, status } });
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
      row.refreshTokenExpiresAt,
      row.previousRefreshTokenHash,
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
    row.refreshTokenExpiresAt = account.refreshTokenExpiresAt;
    row.previousRefreshTokenHash = account.previousRefreshTokenHash;
    return row;
  }
}
