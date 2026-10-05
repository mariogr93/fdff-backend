import { Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { GetAccountsUseCase } from "../application/use-cases/get-accounts.use-case";
import { UserRoles } from "../domain/enums/user-roles.enums";
import { ActivateAccountUseCase } from "../application/use-cases/activate-account.use-case";
import { Roles, RolesGuard } from "./guards/roles.guard";

@Controller('accounts')
export class AccountController {
  constructor(
    private readonly getAccountsUseCase: GetAccountsUseCase,
    private readonly activateAccountUseCase: ActivateAccountUseCase,
  ) {}

  @Get()

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRoles.ADMIN)
  async getAccounts() {
    const accounts = await this.getAccountsUseCase.execute();

    return accounts.map((account) => ({
        id: account.id,
      email: account.email,
      role: account.role,
      status: account.status,
    }));
  }


  @Post('activate/:accountId')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRoles.ADMIN)
  async approveAccount(@Param('accountId') accountId: string) {
    return this.activateAccountUseCase.execute({ accountId });
  }
}