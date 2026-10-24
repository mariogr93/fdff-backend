import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/configure-app';
import {
  I_ACCOUNT_REPOSITORY,
  type IAccountRepository,
} from './../src/iam/application/ports/account.repository.interface';
import {
  I_PASSWORD_HASHER,
  type IPasswordHasherPort,
} from './../src/iam/application/ports/password-hasher.port';
import { makeAccount } from './../src/iam/testing/account.fixture';

const REAL = 'Real#Pass1';
const TEMP = 'Temp#Pass1';
const NEXT = 'Brand#New2';

interface Session {
  accessToken: string;
  mustChangePassword: boolean;
}

interface ErrorBody {
  error: string;
}

/**
 * Walks the temporary-password flow against the real AppModule: live Postgres,
 * real JWT guard, real bcrypt. Needs a populated .env, keys/*.pem and the
 * temporary-password migration applied. Run with `npm run test:e2e`.
 *
 * Each scenario inserts its own ACTIVE athlete (unique email, real password and
 * a pending temporary one) and all are deleted afterwards. Throttle storage is
 * replaced because the steps exceed the login limit.
 */
describe('Temporary password (e2e)', () => {
  const emails: string[] = [];
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let hasher: IPasswordHasherPort;
  let repo: IAccountRepository;

  const http = () => request(app.getHttpServer());
  const login = (email: string, password: string) =>
    http().post('/api/auth/login').send({ email, password });

  const createAccount = async (
    overrides: Parameters<typeof makeAccount>[0] = {},
  ): Promise<string> => {
    const email = `e2e-${randomUUID()}@fdff.test`;
    emails.push(email);
    await repo.save(
      makeAccount({
        id: randomUUID(),
        email,
        passwordHash: await hasher.hash(REAL),
        temporaryPasswordHash: await hasher.hash(TEMP),
        ...overrides,
      }),
    );
    return email;
  };

  const statusOf = async (email: string): Promise<string> => {
    const rows = await dataSource.query<{ status: string }[]>(
      'SELECT status FROM accounts WHERE email = $1',
      [email],
    );
    return rows[0].status;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      // Counts every request as the first, so no limit is ever reached.
      .overrideProvider(ThrottlerStorage)
      .useValue({
        increment: () =>
          Promise.resolve({
            totalHits: 1,
            timeToExpire: 60,
            isBlocked: false,
            timeToBlockExpire: 0,
          }),
      })
      .compile();

    app = configureApp(
      moduleRef.createNestApplication(),
    ) as INestApplication<App>;
    await app.init();
    dataSource = app.get(DataSource);
    hasher = app.get<IPasswordHasherPort>(I_PASSWORD_HASHER);
    repo = app.get<IAccountRepository>(I_ACCOUNT_REPOSITORY);
  });

  afterAll(async () => {
    await dataSource.query('DELETE FROM accounts WHERE email = ANY($1)', [
      emails,
    ]);
    await app.close();
  });

  it('1. a temporary password signs in once, restricted, until the password is changed', async () => {
    const email = await createAccount();

    const first = await login(email, TEMP);
    expect(first.status).toBe(200);
    expect((first.body as Session).mustChangePassword).toBe(true);
    const cookie = (
      first.headers['set-cookie'] as unknown as string[]
    )[0].split(';')[0];

    // Restricted: even a route the role cannot use answers with the restriction.
    const blocked = await http()
      .get('/api/accounts')
      .set('Authorization', `Bearer ${(first.body as Session).accessToken}`);
    expect(blocked.status).toBe(403);
    expect((blocked.body as ErrorBody).error).toBe(
      'PasswordChangeRequiredException',
    );

    // A page reload keeps the restriction.
    const refreshed = await http()
      .post('/api/auth/refresh')
      .set('Cookie', cookie);
    expect(refreshed.status).toBe(200);
    expect((refreshed.body as Session).mustChangePassword).toBe(true);

    // The temporary password is the current password, and the change frees the account.
    const changed = await http()
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${(refreshed.body as Session).accessToken}`)
      .send({ currentPassword: TEMP, newPassword: NEXT });
    expect(changed.status).toBe(204);

    expect((await login(email, TEMP)).status).toBe(401);
    const free = await login(email, NEXT);
    expect(free.status).toBe(200);
    expect((free.body as Session).mustChangePassword).toBe(false);

    const afterwards = await http()
      .get('/api/accounts')
      .set('Authorization', `Bearer ${(free.body as Session).accessToken}`);
    expect((afterwards.body as ErrorBody).error).toBe('ForbiddenRoleException');
  });

  it('2. using the temporary password twice deactivates the account', async () => {
    const email = await createAccount();

    expect((await login(email, TEMP)).status).toBe(200);

    const second = await login(email, TEMP);
    expect(second.status).toBe(401);
    expect((second.body as ErrorBody).error).toBe(
      'TemporaryPasswordAlreadyUsedException',
    );
    expect(await statusOf(email)).toBe('INACTIVE');

    const third = await login(email, TEMP);
    expect((third.body as ErrorBody).error).toBe(
      'AccountNotActivatedException',
    );
  });

  it('3. the real password keeps working and drops a pending temporary one', async () => {
    const email = await createAccount();

    const real = await login(email, REAL);
    expect(real.status).toBe(200);
    expect((real.body as Session).mustChangePassword).toBe(false);

    expect((await login(email, TEMP)).status).toBe(401);
  });

  it('4. an expired temporary password is refused', async () => {
    const email = await createAccount({
      temporaryPasswordExpiresAt: new Date(Date.now() - 60_000),
    });

    expect((await login(email, TEMP)).status).toBe(401);
    expect((await login(email, REAL)).status).toBe(200);
  });

  it('5. a wrong password costs about the same for a pending temp, none and an unknown email', async () => {
    const withTemp = await createAccount();
    const withoutTemp = await createAccount({ temporaryPasswordHash: null });

    const timed = async (email: string): Promise<number> => {
      const start = Date.now();
      await login(email, 'Wrong#Pass9');
      return Date.now() - start;
    };
    const [a, b, c] = [
      await timed(withTemp),
      await timed(withoutTemp),
      await timed('nobody@fdff.test'),
    ];

    // Generous bound: two bcrypt comparisons each, so no case is a fast outlier.
    const slowest = Math.max(a, b, c);
    const fastest = Math.min(a, b, c);
    expect(fastest).toBeGreaterThan(slowest * 0.5);
  });
});
