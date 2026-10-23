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

const CURRENT = 'Current#Pass1';
const NEXT = 'Brand#New2';

interface Session {
  accessToken: string;
}

interface ErrorBody {
  statusCode: number;
  error: string;
  message: string | string[];
}

/** `refresh_token=...` from a Set-Cookie header, ready to send back. */
const refreshCookie = (setCookie: string[] | undefined): string => {
  const cookie = setCookie?.find((c) => c.startsWith('refresh_token='));
  if (!cookie) throw new Error('No refresh_token cookie in the response.');
  return cookie.split(';')[0];
};

/**
 * Walks POST /api/auth/change-password against the real AppModule: live
 * Postgres, real JWT guard, real bcrypt. Needs a populated .env and
 * keys/*.pem. Run with `npm run test:e2e`; it is not part of `npm test`.
 *
 * It inserts one ACTIVE athlete with a unique email and deletes it afterwards.
 * Throttle storage is replaced because the steps exceed the login (5/min)
 * and change-password (2 per 10 min) limits.
 * The steps share state, so they must run in order.
 */
describe('Change password (e2e)', () => {
  const email = `e2e-${randomUUID()}@fdff.test`;
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let oldAccessToken: string;
  let oldCookie: string;
  let accessToken: string;

  const http = () => request(app.getHttpServer());
  const login = (password: string) =>
    http().post('/api/auth/login').send({ email, password });
  const changePassword = (token: string | null, body: object) => {
    const req = http().post('/api/auth/change-password');
    return (token ? req.set('Authorization', `Bearer ${token}`) : req).send(
      body,
    );
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      // Counts every request as the first, so no limit is ever reached. The
      // guard itself stays in place: overriding it does not reach APP_GUARD.
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

    const hasher = app.get<IPasswordHasherPort>(I_PASSWORD_HASHER);
    await app.get<IAccountRepository>(I_ACCOUNT_REPOSITORY).save(
      makeAccount({
        id: randomUUID(),
        email,
        passwordHash: await hasher.hash(CURRENT),
      }),
    );
  });

  afterAll(async () => {
    await dataSource.query('DELETE FROM accounts WHERE email = $1', [email]);
    await app.close();
  });

  it('1. changes the password, answers 204 and clears the refresh cookie', async () => {
    const loginRes = await login(CURRENT);
    expect(loginRes.status).toBe(200);
    oldAccessToken = (loginRes.body as Session).accessToken;
    oldCookie = refreshCookie(loginRes.headers['set-cookie']);

    const res = await changePassword(oldAccessToken, {
      currentPassword: CURRENT,
      newPassword: NEXT,
    });

    expect(res.status).toBe(204);
    expect(res.headers['set-cookie']?.[0]).toContain('refresh_token=;');
  });

  it('2. revokes the access token and refresh cookie issued before', async () => {
    const withOldToken = await changePassword(oldAccessToken, {
      currentPassword: NEXT,
      newPassword: 'Other#Pass3',
    });
    expect(withOldToken.status).toBe(401);

    const withOldCookie = await http()
      .post('/api/auth/refresh')
      .set('Cookie', oldCookie);
    expect(withOldCookie.status).toBe(401);
  });

  it('3. refuses the old password at login and accepts the new one', async () => {
    expect((await login(CURRENT)).status).toBe(401);

    const res = await login(NEXT);
    expect(res.status).toBe(200);
    accessToken = (res.body as Session).accessToken;
  });

  it('4. rejects a wrong current password with 400 and keeps the session valid', async () => {
    const body = { currentPassword: 'Wrong#Pass9', newPassword: 'Other#Pass3' };

    const first = await changePassword(accessToken, body);
    expect(first.status).toBe(400);
    expect((first.body as ErrorBody).error).toBe(
      'CurrentPasswordIncorrectException',
    );

    // Still 400, not 401: a failed attempt does not revoke the token.
    expect((await changePassword(accessToken, body)).status).toBe(400);
  });

  it('5. rejects a new password equal to the current one', async () => {
    const res = await changePassword(accessToken, {
      currentPassword: NEXT,
      newPassword: NEXT,
    });

    expect(res.status).toBe(400);
    expect((res.body as ErrorBody).error).toBe('NewPasswordUnchangedException');
  });

  it('6. rejects a weak new password with validation messages', async () => {
    const res = await changePassword(accessToken, {
      currentPassword: NEXT,
      newPassword: 'weakpass',
    });

    expect(res.status).toBe(400);
    expect(Array.isArray((res.body as ErrorBody).message)).toBe(true);
  });

  it('7. rejects a call with no token', async () => {
    const res = await changePassword(null, {
      currentPassword: NEXT,
      newPassword: 'Other#Pass3',
    });

    expect(res.status).toBe(401);
  });

  it('8. leaves the password set in step 1 in place after the failures', async () => {
    expect((await login(NEXT)).status).toBe(200);
  });
});
