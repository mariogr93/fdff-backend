import { AccountStatus } from '../../domain/enums/account-status.enum';
import { makeAccount } from '../../testing/account.fixture';
import { FakeAccountRepository } from '../../testing/fake-account.repository';
import type { IMailerPort, TemporaryPasswordMail } from '../ports/mailer.port';
import type { IPasswordHasherPort } from '../ports/password-hasher.port';
import {
  FORGOT_PASSWORD_TTL_MS,
  RequestTemporaryPasswordUseCase,
} from './request-temporary-password.use-case';

const build = (accounts = [makeAccount()]) => {
  const repo = new FakeAccountRepository(accounts);
  const hash = jest.fn((plain: string) => Promise.resolve(`hash:${plain}`));
  const passwordHasher: IPasswordHasherPort = {
    hash,
    compare: jest.fn(() => Promise.resolve(false)),
  };
  const sent: TemporaryPasswordMail[] = [];
  const sendTemporaryPassword = jest.fn((mail: TemporaryPasswordMail) => {
    sent.push(mail);
    return Promise.resolve();
  });
  const mailer: IMailerPort = { sendTemporaryPassword };

  const useCase = new RequestTemporaryPasswordUseCase(
    repo,
    passwordHasher,
    { generate: () => 'Tmp#2abc' },
    mailer,
  );

  return { useCase, repo, hash, sent, sendTemporaryPassword };
};

describe('RequestTemporaryPasswordUseCase', () => {
  it('stores the hash of a new temporary password, valid one hour, beside the real one', async () => {
    const account = makeAccount({ passwordHash: 'real-hash' });
    const { useCase, repo } = build([account]);

    const before = Date.now();
    await useCase.execute({ email: account.email });

    const stored = await repo.findById(account.id);
    expect(stored?.temporaryPasswordHash).toBe('hash:Tmp#2abc');
    expect(stored?.temporaryPasswordUsedAt).toBeNull();
    expect(stored?.passwordHash).toBe('real-hash');
    const expiresAt = stored?.temporaryPasswordExpiresAt?.getTime() ?? 0;
    expect(expiresAt).toBeGreaterThanOrEqual(before + FORGOT_PASSWORD_TTL_MS);
  });

  it('mails the plain temporary password to the account address', async () => {
    const account = makeAccount();
    const { useCase, sent } = build([account]);

    await useCase.execute({ email: `  ${account.email.toUpperCase()} ` });

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      to: account.email,
      temporaryPassword: 'Tmp#2abc',
    });
  });

  it('replaces a pending temporary password and makes it unused again', async () => {
    const account = makeAccount({
      temporaryPasswordHash: 'older',
      temporaryPasswordUsedAt: new Date(),
    });
    const { useCase, repo } = build([account]);

    await useCase.execute({ email: account.email });

    const stored = await repo.findById(account.id);
    expect(stored?.temporaryPasswordHash).toBe('hash:Tmp#2abc');
    expect(stored?.temporaryPasswordUsedAt).toBeNull();
  });

  it.each([AccountStatus.PENDING, AccountStatus.INACTIVE])(
    'does nothing for a %s account, but still pays the hash',
    async (status) => {
      const account = makeAccount({ status });
      const { useCase, repo, hash, sendTemporaryPassword } = build([account]);

      await useCase.execute({ email: account.email });

      expect(sendTemporaryPassword).not.toHaveBeenCalled();
      expect(
        (await repo.findById(account.id))?.temporaryPasswordHash,
      ).toBeNull();
      expect(hash).toHaveBeenCalledTimes(1);
    },
  );

  it('answers the same for an unknown email, and still pays the hash', async () => {
    const { useCase, hash, sendTemporaryPassword } = build([]);

    await expect(
      useCase.execute({ email: 'nobody@fdff.test' }),
    ).resolves.toBeUndefined();

    expect(sendTemporaryPassword).not.toHaveBeenCalled();
    expect(hash).toHaveBeenCalledTimes(1);
  });

  it('does not fail when the mail cannot be sent', async () => {
    const account = makeAccount();
    const { useCase, sendTemporaryPassword } = build([account]);
    sendTemporaryPassword.mockRejectedValueOnce(new Error('smtp down'));

    await expect(
      useCase.execute({ email: account.email }),
    ).resolves.toBeUndefined();
  });
});
