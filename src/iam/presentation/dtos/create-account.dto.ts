import {
  IsEmail,
  IsEnum,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { IsPasswordStrong } from '../../../shared/validators/password-strength.validator';
import { UserRoles } from '../../domain/enums/user-roles.enums';

/** Admin-only account creation. The role is required and explicit. */
export class CreateAccountDto {
  @IsEmail()
  @MaxLength(100)
  email: string;

  @IsString()
  @MinLength(8)
  @MaxLength(20)
  @IsPasswordStrong()
  password: string;

  @IsEnum(UserRoles)
  role: UserRoles;
}
