import { AccountStatus } from '../../domain/enums/account-status.enum';
import { UserRoles } from '../../domain/enums/user-roles.enums';

/** The only projection of an Account the API returns. Never add a hash here. */
export class AccountResponseDto {
  id: string;
  email: string;
  role: UserRoles;
  status: AccountStatus;
}

export class AccountsPageResponseDto {
  data: AccountResponseDto[];
  /** Total matching the filters, ignoring page and limit. */
  total: number;
  page: number;
  limit: number;
}
