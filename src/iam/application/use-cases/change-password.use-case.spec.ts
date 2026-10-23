import { AccountNotFoundException } from '../../domain/exceptions/account-not-found.exception';
import { CurrentPasswordIncorrectException } from '../../domain/exceptions/current-password-incorrect.exception';
import { NewPasswordUnchangedException } from '../../domain/exceptions/new-password-unchanged.exception';
import { makeAccount } from '../../testing/account.fixture';
import { FakeAccountRepository } from '../../testing/fake-account.repository';
import type { IPasswordHasherPort } from '../ports/password-hasher.port';
import { ChangePasswordUseCase } from './change-password.use-case';

const build = (accounts = [makeAccount({ tokenVersion: 2 })]) => {
  const repo = new FakeAccountRepository(accounts);

  const compare = jest.fn((plain: string) =>
    Promise.resolve(plain === 'Current#Pass1'),
  );
  const hash = jest.fn((plain: string) => Promise.resolve(`hash:${plain}`));
  const passwordHasher: IPasswordHasherPort = { hash, compare };

  return {
    useCase: new ChangePasswordUseCase(repo, passwordHasher),
    repo,
    hash,
  };
};

const command = (accountId: string, overrides = {}) => ({
  accountId,
  currentPlainPassword: 'Current#Pass1',
  newPlainPassword: 'Brand#New2',
  ...overrides,
});

describe('ChangePasswordUseCase', () => {
  it('stores only the hash of the new password', async () => {
    const account = makeAccount();
    const { useCase, repo } = build([account]);

    await useCase.execute(command(account.id));

    expect((await repo.findById(account.id))?.passwordHash).toBe(
      'hash:Brand#New2',
    );
  });

  it('ends every session and revokes the access tokens', async () => {
    const account = makeAccount({
      tokenVersion: 2,
      refreshTokenHash: 'other-device',
      previousRefreshTokenHash: 'older',
    });
    const { useCase, repo } = build([account]);

    await useCase.execute(command(account.id));

    const stored = await repo.findById(account.id);
    expect(stored?.tokenVersion).toBe(3);
    expect(stored?.refreshTokenHash).toBeNull();
    expect(stored?.previousRefreshTokenHash).toBeNull();
  });

  it('rejects a wrong current password and changes nothing', async () => {
    const account = makeAccount();
    const { useCase, repo, hash } = build([account]);

    await expect(
      useCase.execute(
        command(account.id, { currentPlainPassword: 'Wrong#Pass9' }),
      ),
    ).rejects.toThrow(CurrentPasswordIncorrectException);

    expect(hash).not.toHaveBeenCalled();
    expect(await repo.findById(account.id)).toEqual(account);
  });

  it('rejects a new password equal to the current one', async () => {
    const account = makeAccount();
    const { useCase, repo } = build([account]);

    await expect(
      useCase.execute(
        command(account.id, { newPlainPassword: 'Current#Pass1' }),
      ),
    ).rejects.toThrow(NewPasswordUnchangedException);

    expect(await repo.findById(account.id)).toEqual(account);
  });

  it('answers 404 for an account that no longer exists', async () => {
    const { useCase } = build([]);

    await expect(useCase.execute(command('missing-id'))).rejects.toThrow(
      AccountNotFoundException,
    );
  });
});
