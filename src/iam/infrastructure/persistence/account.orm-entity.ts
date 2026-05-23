import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AccountStatus } from '../../domain/enums/account-status.enum';
import { UserRoles } from '../../domain/enums/user-roles.enums';

@Entity('accounts')
export class AccountOrmEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column({ name: 'password_hash' })
  passwordHash: string;

  @Column({ type: 'enum', enum: UserRoles, enumName: 'account_role' })
  role: UserRoles;

  @Column({
    type: 'enum',
    enum: AccountStatus,
    enumName: 'account_status',
    default: AccountStatus.PENDING,
  })
  status: AccountStatus;

  @Column({ name: 'failed_login_attempts', type: 'int', default: 0 })
  failedLoginAttempts: number;

  @Column({ name: 'locked_until', type: 'timestamptz', nullable: true })
  lockedUntil: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
