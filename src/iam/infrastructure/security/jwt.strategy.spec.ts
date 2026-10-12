import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccountStatus } from '../../domain/enums/account-status.enum';
import { UserRoles } from '../../domain/enums/user-roles.enums';
import { makeAccount } from '../../testing/account.fixture';
import { FakeAccountRepository } from '../../testing/fake-account.repository';
import { JwtStrategy } from './jwt.strategy';

// Inline PEM values: the strategy only needs a non-empty key to construct, and
// these tests call validate() directly instead of verifying a token.
const config = {
  get: (key: string) =>
    key === 'JWT_PRIVATE_KEY' || key === 'JWT_PUBLIC_KEY'
      ? 'test-key'
      : undefined,
} as unknown as ConfigService;

const build = (accounts = [makeAccount()]) =>
  new JwtStrategy(config, new FakeAccountRepository(accounts));

describe('JwtStrategy.validate', () => {
  it('returns only id, email and role, never a hash', async () => {
    const account = makeAccount({
      role: UserRoles.JUDGE,
      passwordHash: 'secret-password-hash',
      refreshTokenHash: 'secret-refresh-hash',
    });

    const user = await build([account]).validate({
      sub: account.id,
      email: account.email,
    });

    expect(user).toEqual({
      id: account.id,
      email: account.email,
      role: UserRoles.JUDGE,
    });
    expect(JSON.stringify(user)).not.toContain('secret');
  });

  it('rejects a payload without a subject', async () => {
    await expect(
      build().validate({ email: 'x' } as never),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an account that no longer exists', async () => {
    await expect(
      build([]).validate({ sub: 'missing', email: 'x' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it.each([AccountStatus.PENDING, AccountStatus.INACTIVE])(
    'rejects a %s account, so deactivation revokes access at once',
    async (status) => {
      const account = makeAccount({ status });

      await expect(
        build([account]).validate({ sub: account.id, email: account.email }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    },
  );
});
