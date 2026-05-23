import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { UserRoles } from '../../domain/enums/user-roles.enums';

export class RegisterAccountDto {
  @IsEmail()
  @MaxLength(100)
  email: string;

  @IsString()
  @MinLength(8)
  @MaxLength(20)
  password: string;

  @IsOptional()
  @IsEnum(UserRoles)
  @Transform(({ value }) => value ?? UserRoles.ATHLETE)
  role?: UserRoles;
}
