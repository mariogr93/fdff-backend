import { AccountStatus } from "./enums/account-status.enum";
import { UserRoles } from "./enums/user-roles.enums";

export class Account {
constructor(  public readonly id: string,
  public readonly email: string,
  public readonly passwordHash: string,
  public readonly role: UserRoles,
  public readonly status: AccountStatus
) {}
}