import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { UserRoles } from '../domain/enums/user-roles.enums';
import { LoginAccountUseCase } from '../application/use-cases/login-account.use-case';
import { RegisterAccountUseCase } from '../application/use-cases/register-account.use-case';
import { RegisterRoleGuard } from '../../shared/guards/register-role.guard';
import { LoginDto } from './dtos/login.dto';
import { RegisterAccountDto } from './dtos/register-account.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly registerAccount: RegisterAccountUseCase,
    private readonly loginAccount: LoginAccountUseCase,
  ) {}

  @Post('register')
  @Throttle({ default: { limit: 10, ttl: 3600000 } })
  @UseGuards(RegisterRoleGuard)
  async register(@Body() dto: RegisterAccountDto) {
    const account = await this.registerAccount.execute({
      email: dto.email,
      plainPassword: dto.password,
      role: dto.role ?? UserRoles.ATHLETE,
    });

    return {
      id: account.id,
      email: account.email,
      role: account.role,
      status: account.status,
    };
  }

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto) {
    return this.loginAccount.execute({
      email: dto.email,
      plainPassword: dto.password,
    });
  }
}
