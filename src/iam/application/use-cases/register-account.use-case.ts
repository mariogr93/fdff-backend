import { Inject, Injectable } from "@nestjs/common";
import { Account } from "../../domain/account.model";
import { I_ACCOUNT_REPOSITORY, type IAccountRepository } from "../ports/account.repository.interface";
import { I_PASSWORD_HASHER, type IPasswordHasherPort } from "../ports/password-hasher.port";
import { AccountStatus } from "src/iam/domain/enums/account-status.enum";
import { UserRoles } from "src/iam/domain/enums/user-roles.enums";
import { randomUUID } from 'crypto';
import { AccountAlreadyExistsException } from "src/iam/domain/exceptions/account-already-exists.exception";


// We use an internal Application DTO to define the exact input this Use Case needs.
export interface RegisterAccountCommand {
    email: string;
    plainPassword: string;
    role: UserRoles;
}


@Injectable()
export class RegisterAccountUseCase {
  constructor(
    // We inject the INTERFACES using the string tokens. 
    // This Use Case has no idea TypeORM or Bcrypt exist!
    @Inject(I_ACCOUNT_REPOSITORY)
    private readonly accountRepo: IAccountRepository,

    @Inject(I_PASSWORD_HASHER)
    private readonly passwordHasher: IPasswordHasherPort,) {}

  async execute(command: RegisterAccountCommand): Promise<Account> {

    // 1. Check for duplicates
    const existingAccount = await this.accountRepo.findByEmail(command.email);
    if (existingAccount) {
      throw new AccountAlreadyExistsException(command.email);
    }

    // 2. Hash the password
    const hashedPassword = await this.passwordHasher.hash(command.plainPassword);

    // 3. Create the pure Domain Entity
    // (Assuming your Account model has a static factory method or constructor)
    const newAccount = new Account(
      randomUUID(),
      command.email,
      hashedPassword,
      command.role,
      AccountStatus.PENDING
    );
    
    // 4. Save to the database
    await this.accountRepo.save(newAccount);

    // 5. Return the newly created account
    return newAccount;
  }
}