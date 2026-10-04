import { AccountStatus } from '../../domain/enums/account-status.enum';
import { UserRoles } from '../../domain/enums/user-roles.enums';

export enum AccountsSortOrder {
  ASC = 'ASC',
  DESC = 'DESC',
}

export interface AccountsQuery {
  email?: string;
  role?: UserRoles;
  status?: AccountStatus;
  page?: number;
  limit?: number;
  sortOrder?: AccountsSortOrder;
}
