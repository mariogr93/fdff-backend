import { Repository } from 'typeorm';
import { AccountAlreadyExistsException } from '../../domain/exceptions/account-already-exists.exception';
import { makeAccount } from '../../testing/account.fixture';
import { AccountOrmEntity } from './account.orm-entity';
import { TypeOrmAccountRepository } from './typeorm-account.repository';

/** Only the Postgres error translation and the conditional update are tested
 *  here; the SQL itself needs a database (see test:e2e). */
const build = (stub: Partial<Record<'insert' | 'update', jest.Mock>>) =>
  new TypeOrmAccountRepository(stub as unknown as Repository<AccountOrmEntity>);

describe('TypeOrmAccountRepository', () => {
  describe('save', () => {
    it('inserts a new account', async () => {
      const insert = jest.fn().mockResolvedValue(undefined);

      await build({ insert }).save(makeAccount());

      expect(insert).toHaveBeenCalledTimes(1);
    });

    it('turns a Postgres unique violation into AccountAlreadyExistsException', async () => {
      const insert = jest
        .fn()
        .mockRejectedValue({ driverError: { code: '23505' } });

      await expect(
        build({ insert }).save(makeAccount()),
      ).rejects.toBeInstanceOf(AccountAlreadyExistsException);
    });

    it('rethrows any other database error untouched', async () => {
      const failure = { driverError: { code: '08006' } };
      const insert = jest.fn().mockRejectedValue(failure);

      await expect(build({ insert }).save(makeAccount())).rejects.toBe(failure);
    });
  });

  describe('updateIfRefreshTokenHashIs', () => {
    it('is true when exactly one row matched', async () => {
      const update = jest.fn().mockResolvedValue({ affected: 1 });
      const account = makeAccount();

      const won = await build({ update }).updateIfRefreshTokenHashIs(
        account,
        'expected',
      );

      expect(won).toBe(true);
      expect(update).toHaveBeenCalledWith(
        { id: account.id, refreshTokenHash: 'expected' },
        expect.any(Object),
      );
    });

    it('is false when no row matched', async () => {
      const update = jest.fn().mockResolvedValue({ affected: 0 });

      expect(
        await build({ update }).updateIfRefreshTokenHashIs(makeAccount(), 'x'),
      ).toBe(false);
    });
  });
});
