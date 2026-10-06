import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { IsPasswordStrong } from '../../../shared/validators/password-strength.validator';
import { UserRoles } from '../../domain/enums/user-roles.enums';

/** Public self-signup. Privileged accounts go through POST /accounts. */
export class RegisterAccountDto {
  @IsEmail()
  @MaxLength(100)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email: string;

  @IsString()
  @MinLength(8)
  @MaxLength(20)
  @IsPasswordStrong()
  password: string;

  /**
   * Accepted but ignored — RegisterAccountUseCase always creates an ATHLETE.
   * The field stays because the SPA sends `role: "ATHLETE"` and the global
   * ValidationPipe runs with forbidNonWhitelisted, so dropping it would reject
   * every signup. Restricting it to ATHLETE makes an escalation attempt a
   * clear 400 rather than a silently ignored value.
   */
  @IsOptional()
  @IsIn([UserRoles.ATHLETE])
  role?: UserRoles.ATHLETE;
}
