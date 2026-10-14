import { AccountStatus } from '../../domain/enums/account-status.enum';
import { UserRoles } from '../../domain/enums/user-roles.enums';
import { AccountAlreadyExistsException } from '../../domain/exceptions/account-already-exists.exception';
import { makeAccount } from '../../testing/account.fixture';
import { FakeAccountRepository } from '../../testing/fake-account.repository';
import type { IPasswordHasherPort } from '../ports/password-hasher.port';
import { CreateAccountUseCase } from './create-account.use-case';

const hasher = (): IPasswordHasherPort => ({
  hash: jest.fn(() => Promise.resolve('bcrypt-hash')),
  compare: jest.fn(() => Promise.resolve(true)),
});

const signup = { email: 'athlete@fdff.test', plainPassword: 'Str0ng$pass' };

describe('CreateAccountUseCase (admin-provisioned)', () => {
  it.each([UserRoles.ADMIN, UserRoles.JUDGE, UserRoles.ATHLETE])(
    'creates an ACTIVE %s',
    async (role) => {
      const account = await new CreateAccountUseCase(
        new FakeAccountRepository(),
        hasher(),
      ).execute({ ...signup, role });

      expect(account.role).toBe(role);
      expect(account.status).toBe(AccountStatus.ACTIVE);
      expect(account.isActive()).toBe(true);
    },
  );

  it('stores the email trimmed and lowercase', async () => {
    const account = await new CreateAccountUseCase(
      new FakeAccountRepository(),
      hasher(),
    ).execute({ ...signup, email: ' Judge@FDFF.test', role: UserRoles.JUDGE });

    expect(account.email).toBe('judge@fdff.test');
  });

  it('treats a differently-cased email as a duplicate', async () => {
    const repo = new FakeAccountRepository([
      makeAccount({ email: 'athlete@fdff.test' }),
    ]);

    await expect(
      new CreateAccountUseCase(repo, hasher()).execute({
        ...signup,
        email: 'Athlete@FDFF.test',
        role: UserRoles.JUDGE,
      }),
    ).rejects.toThrow(AccountAlreadyExistsException);
  });

  it('rejects a duplicate email', async () => {
    const repo = new FakeAccountRepository([
      makeAccount({ email: signup.email }),
    ]);

    await expect(
      new CreateAccountUseCase(repo, hasher()).execute({
        ...signup,
        role: UserRoles.JUDGE,
      }),
    ).rejects.toThrow(AccountAlreadyExistsException);
  });

  it('hashes the password and never stores the plaintext', async () => {
    const hash = jest.fn(() => Promise.resolve('bcrypt-hash'));
    const account = await new CreateAccountUseCase(
      new FakeAccountRepository(),
      { hash, compare: jest.fn(() => Promise.resolve(true)) },
    ).execute({ ...signup, role: UserRoles.JUDGE });

    expect(hash).toHaveBeenCalledWith('Str0ng$pass');
    expect(account.passwordHash).toBe('bcrypt-hash');
    expect(account.passwordHash).not.toBe('Str0ng$pass');
  });

  it('persists the account it returns', async () => {
    const repo = new FakeAccountRepository();

    const account = await new CreateAccountUseCase(repo, hasher()).execute({
      ...signup,
      role: UserRoles.JUDGE,
    });

    expect((await repo.findById(account.id))?.email).toBe(signup.email);
  });
});
