import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AccountsSortOrder } from '../../application/ports/accounts-query';
import { AccountStatus } from '../../domain/enums/account-status.enum';
import { UserRoles } from '../../domain/enums/user-roles.enums';

export class AccountsListRequestDto {
  /**
   * A search fragment, not an address: the repository matches it with ILIKE
   * '%...%'. Validating it as a full email would make partial search — the
   * only reason this filter exists — impossible.
   */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  email?: string;

  @IsOptional()
  @IsEnum(UserRoles)
  role?: UserRoles;

  @IsOptional()
  @IsEnum(AccountStatus)
  status?: AccountStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;

  @IsOptional()
  @IsEnum(AccountsSortOrder)
  sortOrder?: AccountsSortOrder;
}
