import { AccountStatus } from '../../domain/enums/account-status.enum';
import { UserRoles } from '../../domain/enums/user-roles.enums';
import { AccountAlreadyExistsException } from '../../domain/exceptions/account-already-exists.exception';
import { makeAccount } from '../../testing/account.fixture';
import { FakeAccountRepository } from '../../testing/fake-account.repository';
import type { IPasswordHasherPort } from '../ports/password-hasher.port';
import { CreateAccountUseCase } from './create-account.use-case';
import { RegisterAccountUseCase } from './register-account.use-case';

const hasher = (): IPasswordHasherPort => ({
  hash: jest.fn(() => Promise.resolve('bcrypt-hash')),
  compare: jest.fn(() => Promise.resolve(true)),
});

const signup = { email: 'athlete@fdff.test', plainPassword: 'Str0ng$pass' };

describe('RegisterAccountUseCase (public self-signup)', () => {
  it('creates a PENDING ATHLETE', async () => {
    const repo = new FakeAccountRepository();

    const account = await new RegisterAccountUseCase(repo, hasher()).execute(
      signup,
    );

    expect(account.role).toBe(UserRoles.ATHLETE);
    expect(account.status).toBe(AccountStatus.PENDING);
    expect(account.isActive()).toBe(false);
  });

  /**
   * The command type has no role field at all, so public signup cannot be made
   * to produce a privileged account even if a controller, DTO or guard above it
   * is wrong. This is the structural half of the defence; the DTO rejecting a
   * non-ATHLETE role is the cosmetic half.
   */
  it('has no way to express a role, so it cannot escalate', () => {
    const command: Parameters<RegisterAccountUseCase['execute']>[0] = signup;

    expect(Object.keys(command).sort()).toEqual(['email', 'plainPassword']);
  });

  it('hashes the password and never stores the plaintext', async () => {
    const hash = jest.fn(() => Promise.resolve('bcrypt-hash'));
    const account = await new RegisterAccountUseCase(
      new FakeAccountRepository(),
      { hash, compare: jest.fn(() => Promise.resolve(true)) },
    ).execute(signup);

    expect(hash).toHaveBeenCalledWith('Str0ng$pass');
    expect(account.passwordHash).toBe('bcrypt-hash');
    expect(account.passwordHash).not.toBe('Str0ng$pass');
  });

  it('rejects a duplicate email', async () => {
    const repo = new FakeAccountRepository([
      makeAccount({ email: signup.email }),
    ]);

    await expect(
      new RegisterAccountUseCase(repo, hasher()).execute(signup),
    ).rejects.toThrow(AccountAlreadyExistsException);
  });

  it('gives each account a distinct id', async () => {
    const repo = new FakeAccountRepository();
    const useCase = new RegisterAccountUseCase(repo, hasher());

    const first = await useCase.execute(signup);
    const second = await useCase.execute({
      ...signup,
      email: 'other@fdff.test',
    });

    expect(first.id).not.toBe(second.id);
  });
});

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
});
