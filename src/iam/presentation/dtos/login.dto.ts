import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  @MaxLength(100)
  email: string;

  @IsString()
  @MinLength(8)
  @MaxLength(20)
  password: string;
}
