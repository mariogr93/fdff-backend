import { IsString, MaxLength, MinLength } from 'class-validator';
import { IsPasswordStrong } from '../../../shared/validators/password-strength.validator';

export class ChangePasswordDto {
  @IsString()
  @MinLength(8)
  @MaxLength(20)
  currentPassword: string;

  @IsString()
  @MinLength(8)
  @MaxLength(20)
  @IsPasswordStrong()
  newPassword: string;
}
