import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { configureApp } from '../../configure-app';
import { I_AUTH_POLICY } from '../application/ports/auth-policy';
import { LoginAccountUseCase } from '../application/use-cases/login-account.use-case';
import { LogoutAccountUseCase } from '../application/use-cases/logout-account.use-case';
import { RefreshAccountUseCase } from '../application/use-cases/refresh-account.use-case';
import { RegisterAccountUseCase } from '../application/use-cases/register-account.use-case';
import { DEFAULT_LOCKOUT_POLICY } from '../domain/account.model';
import { AuthController } from './auth.controller';
import { SameOriginGuard } from './guards/same-origin.guard';

const APP = 'https://app.fdff.test';
const ADMIN_APP = 'https://admin.fdff.test';
const CREDENTIALS = { email: 'athlete@fdff.test', password: 'Correct#Pass1' };
const SESSION = {
  accessToken: 'access',
  refreshToken: 'refresh',
  accountId: 'id',
  role: 'ATHLETE',
};

interface ErrorResponse {
  statusCode: number;
  error: string;
}

/**
 * Runs the real HTTP pipeline from configureApp (JSON-only middleware, parsers,
 * validation, exception filter) in front of the real AuthController and
 * SameOriginGuard. The use cases are stubs: what is under test is which
 * requests reach them.
 */
describe('AuthController request filtering', () => {
  const original = process.env.FRONTEND_URL;
  let app: INestApplication<App>;
  let login: { execute: jest.Mock };
  let logout: { execute: jest.Mock };
  let refresh: { execute: jest.Mock };
  let register: { execute: jest.Mock };

  beforeEach(async () => {
    process.env.FRONTEND_URL = `${APP}, ${ADMIN_APP}`;
    login = { execute: jest.fn().mockResolvedValue(SESSION) };
    logout = { execute: jest.fn().mockResolvedValue(undefined) };
    refresh = { execute: jest.fn().mockResolvedValue(SESSION) };
    register = {
      execute: jest.fn().mockResolvedValue({
        id: 'id',
        email: CREDENTIALS.email,
        role: 'ATHLETE',
        status: 'PENDING',
      }),
    };

    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ ignoreEnvFile: true, isGlobal: true })],
      controllers: [AuthController],
      providers: [
        SameOriginGuard,
        { provide: LoginAccountUseCase, useValue: login },
        { provide: LogoutAccountUseCase, useValue: logout },
        { provide: RefreshAccountUseCase, useValue: refresh },
        { provide: RegisterAccountUseCase, useValue: register },
        {
          provide: I_AUTH_POLICY,
          useValue: {
            refreshTokenTtlMs: 86_400_000,
            lockout: DEFAULT_LOCKOUT_POLICY,
            secureCookies: true,
          },
        },
      ],
    }).compile();

    app = configureApp(
      moduleRef.createNestApplication(),
    ) as INestApplication<App>;
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    if (original === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = original;
  });

  const http = () => request(app.getHttpServer());

  describe('same-origin check', () => {
    it.each([APP, ADMIN_APP])('lets %s sign in', async (origin) => {
      const res = await http()
        .post('/api/auth/login')
        .set('Origin', origin)
        .send(CREDENTIALS);

      expect(res.status).toBe(200);
      expect(res.headers['set-cookie']?.[0]).toContain('HttpOnly');
      expect(login.execute).toHaveBeenCalledTimes(1);
    });

    it('lets a request with no browser headers through (curl, a server)', async () => {
      const res = await http().post('/api/auth/login').send(CREDENTIALS);

      expect(res.status).toBe(200);
    });

    it.each([
      ['login', '/api/auth/login', CREDENTIALS],
      ['register', '/api/auth/register', CREDENTIALS],
      ['logout', '/api/auth/logout', undefined],
      ['refresh', '/api/auth/refresh', undefined],
    ])(
      'refuses %s from a foreign origin before any use case runs',
      async (_name, path, body) => {
        const req = http()
          .post(path)
          .set('Origin', 'https://evil.test')
          .set('Cookie', 'refresh_token=stolen');
        const res = await (body ? req.send(body) : req);

        expect(res.status).toBe(403);
        expect((res.body as ErrorResponse).error).toBe(
          'CrossOriginRequestException',
        );
        expect(res.headers['set-cookie']).toBeUndefined();
        for (const useCase of [login, logout, refresh, register]) {
          expect(useCase.execute).not.toHaveBeenCalled();
        }
      },
    );

    it('refuses Origin: null (a sandboxed or redirected page)', async () => {
      const res = await http()
        .post('/api/auth/login')
        .set('Origin', 'null')
        .send(CREDENTIALS);

      expect(res.status).toBe(403);
    });

    it('refuses a request the browser marked cross-site when it has no Origin', async () => {
      const res = await http()
        .post('/api/auth/login')
        .set('Sec-Fetch-Site', 'cross-site')
        .send(CREDENTIALS);

      expect(res.status).toBe(403);
      expect(login.execute).not.toHaveBeenCalled();
    });
  });

  describe('JSON-only bodies', () => {
    it('refuses a form-encoded login (what a hostile HTML form sends)', async () => {
      const res = await http()
        .post('/api/auth/login')
        .set('Origin', APP)
        .type('form')
        .send(CREDENTIALS);

      expect(res.status).toBe(415);
      expect(login.execute).not.toHaveBeenCalled();
      expect(res.headers['set-cookie']).toBeUndefined();
    });

    it.each(['text/plain', 'multipart/form-data; boundary=x'])(
      'refuses a body sent as %s',
      async (type) => {
        const res = await http()
          .post('/api/auth/login')
          .set('Content-Type', type)
          .send(JSON.stringify(CREDENTIALS));

        expect(res.status).toBe(415);
        expect(login.execute).not.toHaveBeenCalled();
      },
    );

    it('refuses a form-encoded signup', async () => {
      const res = await http()
        .post('/api/auth/register')
        .type('form')
        .send(CREDENTIALS);

      expect(res.status).toBe(415);
      expect(register.execute).not.toHaveBeenCalled();
    });

    it('still accepts application/json with a charset', async () => {
      const res = await http()
        .post('/api/auth/login')
        .set('Content-Type', 'application/json; charset=utf-8')
        .send(JSON.stringify(CREDENTIALS));

      expect(res.status).toBe(200);
    });

    it('still reports malformed JSON as a 400', async () => {
      const res = await http()
        .post('/api/auth/login')
        .set('Content-Type', 'application/json')
        .send('{"email":');

      expect(res.status).toBe(400);
    });

    it.each(['/api/auth/logout', '/api/auth/refresh'])(
      'lets %s through with an empty body and no Content-Type, as browsers send it',
      async (path) => {
        const res = await http()
          .post(path)
          .set('Origin', APP)
          .set('Cookie', 'refresh_token=valid')
          .set('Content-Length', '0');

        expect(res.status).toBe(200);
      },
    );
  });
});
