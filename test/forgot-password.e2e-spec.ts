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
  I_MAILER,
  type TemporaryPasswordMail,
} from './../src/iam/application/ports/mailer.port';
import {
  I_PASSWORD_HASHER,
  type IPasswordHasherPort,
} from './../src/iam/application/ports/password-hasher.port';
import { AccountStatus } from './../src/iam/domain/enums/account-status.enum';
import { makeAccount } from './../src/iam/testing/account.fixture';

const REAL = 'Real#Pass1';
const NEXT = 'Brand#New2';

interface Session {
  accessToken: string;
  mustChangePassword: boolean;
}

/**
 * Walks forgot password against the real AppModule (live Postgres, real JWT,
 * real bcrypt), with the mailer replaced by one that keeps messages in memory.
 * Needs a populated .env and keys/*.pem. Run with `npm run test:e2e`.
 */
describe('Forgot password (e2e)', () => {
  const emails: string[] = [];
  const outbox: TemporaryPasswordMail[] = [];
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let hasher: IPasswordHasherPort;
  let repo: IAccountRepository;

  const http = () => request(app.getHttpServer());
  const login = (email: string, password: string) =>
    http().post('/api/auth/login').send({ email, password });
  const forgot = (email: string) =>
    http().post('/api/auth/forgot-password').send({ email });

  /** The mail is sent without being awaited; give it a moment to land. */
  const mailFor = async (
    email: string,
  ): Promise<TemporaryPasswordMail | undefined> => {
    for (let i = 0; i < 20; i++) {
      const mail = outbox.find((m) => m.to === email);
      if (mail) return mail;
      await new Promise((r) => setTimeout(r, 25));
    }
    return undefined;
  };

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
        ...overrides,
      }),
    );
    return email;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
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
      .overrideProvider(I_MAILER)
      .useValue({
        sendTemporaryPassword: (mail: TemporaryPasswordMail) => {
          outbox.push(mail);
          return Promise.resolve();
        },
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

  it('1. emails a temporary password that signs in once, forces a change, then the new one works', async () => {
    const email = await createAccount();

    const res = await forgot(email);
    expect(res.status).toBe(202);
    const mail = await mailFor(email);
    expect(mail?.temporaryPassword).toHaveLength(8);
    expect(mail?.expiresAt).not.toBeNull();

    const temp = await login(email, mail!.temporaryPassword);
    expect(temp.status).toBe(200);
    expect((temp.body as Session).mustChangePassword).toBe(true);

    const changed = await http()
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${(temp.body as Session).accessToken}`)
      .send({ currentPassword: mail!.temporaryPassword, newPassword: NEXT });
    expect(changed.status).toBe(204);

    const fresh = await login(email, NEXT);
    expect(fresh.status).toBe(200);
    expect((fresh.body as Session).mustChangePassword).toBe(false);
  });

  it('2. leaves the real password working, and the real password drops the temp', async () => {
    const email = await createAccount();

    await forgot(email);
    const mail = await mailFor(email);

    expect((await login(email, REAL)).status).toBe(200);
    expect((await login(email, mail!.temporaryPassword)).status).toBe(401);
  });

  it('3. answers 202 and sends nothing for an unknown, pending or inactive address', async () => {
    const pending = await createAccount({ status: AccountStatus.PENDING });
    const inactive = await createAccount({ status: AccountStatus.INACTIVE });
    const unknown = `e2e-${randomUUID()}@fdff.test`;

    for (const email of [unknown, pending, inactive]) {
      expect((await forgot(email)).status).toBe(202);
    }
    await new Promise((r) => setTimeout(r, 100));

    for (const email of [unknown, pending, inactive]) {
      expect(outbox.find((m) => m.to === email)).toBeUndefined();
    }
  });
});
