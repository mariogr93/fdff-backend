import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { configureApp } from '../../configure-app';
import { ActivateAccountUseCase } from '../application/use-cases/activate-account.use-case';
import { DeactivateAccountUseCase } from '../application/use-cases/deactivate-account.use-case';
import { GetAccountsUseCase } from '../application/use-cases/get-accounts.use-case';
import { I_ACCOUNT_REPOSITORY } from '../application/ports/account.repository.interface';
import { AccountStatus } from '../domain/enums/account-status.enum';
import { makeAccount } from '../testing/account.fixture';
import { FakeAccountRepository } from '../testing/fake-account.repository';
import { AccountController } from './account.controller';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';

const ACTIVE_ID = '11111111-1111-4111-8111-111111111111';
const PENDING_ID = '22222222-2222-4222-8222-222222222222';
const INACTIVE_ID = '33333333-3333-4333-8333-333333333333';
const MISSING_ID = '44444444-4444-4444-8444-444444444444';

interface AccountsResponse {
  data: { id: string; email: string; role: string; status: string }[];
  total: number;
  page: number;
  limit: number;
}

interface ErrorResponse {
  statusCode: number;
  message: string;
  error: string;
}

/**
 * Exercises the real HTTP pipeline from configureApp — the validation pipe and
 * DomainExceptionFilter — so the status codes asserted here are the ones a
 * client actually receives. The guards are stubbed open because authorization
 * is not what these tests are about; the repository is the in-memory fake, so
 * no database is involved.
 */
describe('AccountController', () => {
  let app: INestApplication<App>;
  let repo: FakeAccountRepository;

  beforeEach(async () => {
    repo = new FakeAccountRepository([
      makeAccount({
        id: ACTIVE_ID,
        email: 'active@fdff.test',
        status: AccountStatus.ACTIVE,
      }),
      makeAccount({
        id: PENDING_ID,
        email: 'pending@fdff.test',
        status: AccountStatus.PENDING,
      }),
      makeAccount({
        id: INACTIVE_ID,
        email: 'inactive@fdff.test',
        status: AccountStatus.INACTIVE,
      }),
    ]);

    const moduleRef = await Test.createTestingModule({
      controllers: [AccountController],
      providers: [
        GetAccountsUseCase,
        ActivateAccountUseCase,
        DeactivateAccountUseCase,
        { provide: I_ACCOUNT_REPOSITORY, useValue: repo },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = configureApp(
      moduleRef.createNestApplication(),
    ) as INestApplication<App>;
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /api/accounts', () => {
    it('returns a paginated envelope and never leaks the password hash', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/accounts')
        .expect(200);
      const body = res.body as AccountsResponse;

      expect(body.total).toBe(3);
      expect(body.page).toBe(1);
      expect(body.limit).toBe(10);
      expect(body.data).toHaveLength(3);
      expect(Object.keys(body.data[0]).sort()).toEqual([
        'email',
        'id',
        'role',
        'status',
      ]);
    });

    it('filters by status', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/accounts?status=PENDING')
        .expect(200);
      const body = res.body as AccountsResponse;

      expect(body.total).toBe(1);
      expect(body.data[0].email).toBe('pending@fdff.test');
    });

    it('paginates, reporting the unpaged total', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/accounts?page=1&limit=2')
        .expect(200);
      const body = res.body as AccountsResponse;

      expect(body.data).toHaveLength(2);
      expect(body.total).toBe(3);
      expect(body.limit).toBe(2);
    });

    it('searches email by fragment, not by exact address', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/accounts?email=pend')
        .expect(200);
      const body = res.body as AccountsResponse;

      expect(body.total).toBe(1);
      expect(body.data[0].email).toBe('pending@fdff.test');
    });

    it('rejects an unknown status with 400', async () => {
      await request(app.getHttpServer())
        .get('/api/accounts?status=NOPE')
        .expect(400);
    });

    it('rejects an unknown query parameter with 400', async () => {
      await request(app.getHttpServer())
        .get('/api/accounts?sneaky=1')
        .expect(400);
    });
  });

  describe('POST /api/accounts/activate/:accountId', () => {
    it('activates a pending account', async () => {
      await request(app.getHttpServer())
        .post(`/api/accounts/activate/${PENDING_ID}`)
        .expect(204);

      expect((await repo.findById(PENDING_ID))?.status).toBe(
        AccountStatus.ACTIVE,
      );
    });

    it('reinstates an inactive account', async () => {
      await request(app.getHttpServer())
        .post(`/api/accounts/activate/${INACTIVE_ID}`)
        .expect(204);

      expect((await repo.findById(INACTIVE_ID))?.status).toBe(
        AccountStatus.ACTIVE,
      );
    });

    it('returns 409, not 500, when the account is already active', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/accounts/activate/${ACTIVE_ID}`)
        .expect(409);
      const body = res.body as ErrorResponse;

      expect(body.error).toBe('AccountAlreadyActiveException');
    });

    it('returns 404 for an unknown account', async () => {
      await request(app.getHttpServer())
        .post(`/api/accounts/activate/${MISSING_ID}`)
        .expect(404);
    });

    it('returns 400, not 500, for a malformed id', async () => {
      await request(app.getHttpServer())
        .post('/api/accounts/activate/not-a-uuid')
        .expect(400);
    });
  });

  describe('POST /api/accounts/deactivate/:accountId', () => {
    it('deactivates an active account and drops its refresh token', async () => {
      await repo.update(
        makeAccount({
          id: ACTIVE_ID,
          status: AccountStatus.ACTIVE,
          refreshTokenHash: 'live-session',
        }),
      );

      await request(app.getHttpServer())
        .post(`/api/accounts/deactivate/${ACTIVE_ID}`)
        .expect(204);

      const stored = await repo.findById(ACTIVE_ID);
      expect(stored?.status).toBe(AccountStatus.INACTIVE);
      expect(stored?.refreshTokenHash).toBeNull();
    });

    it('rejects a pending registration by deactivating it', async () => {
      await request(app.getHttpServer())
        .post(`/api/accounts/deactivate/${PENDING_ID}`)
        .expect(204);

      expect((await repo.findById(PENDING_ID))?.status).toBe(
        AccountStatus.INACTIVE,
      );
    });

    it('returns 409 when the account is already inactive', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/accounts/deactivate/${INACTIVE_ID}`)
        .expect(409);
      const body = res.body as ErrorResponse;

      expect(body.error).toBe('AccountAlreadyInactiveException');
    });

    it('returns 404 for an unknown account', async () => {
      await request(app.getHttpServer())
        .post(`/api/accounts/deactivate/${MISSING_ID}`)
        .expect(404);
    });
  });
});
