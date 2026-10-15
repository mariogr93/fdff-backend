import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { OpenAPIObject } from '@nestjs/swagger';
import { configureApp } from '../../configure-app';
import {
  BEARER_AUTH,
  REFRESH_COOKIE_AUTH,
  buildOpenApiDocument,
} from '../../shared/http/setup-openapi';
import { I_AUTH_POLICY } from '../application/ports/auth-policy';
import { ActivateAccountUseCase } from '../application/use-cases/activate-account.use-case';
import { CreateAccountUseCase } from '../application/use-cases/create-account.use-case';
import { DeactivateAccountUseCase } from '../application/use-cases/deactivate-account.use-case';
import { GetAccountsUseCase } from '../application/use-cases/get-accounts.use-case';
import { LoginAccountUseCase } from '../application/use-cases/login-account.use-case';
import { LogoutAccountUseCase } from '../application/use-cases/logout-account.use-case';
import { RefreshAccountUseCase } from '../application/use-cases/refresh-account.use-case';
import { RegisterAccountUseCase } from '../application/use-cases/register-account.use-case';
import { AccountController } from './account.controller';
import { AuthController } from './auth.controller';
import { SameOriginGuard } from './guards/same-origin.guard';

/**
 * The spec is what the frontend generates its types from, so its routes and
 * security must match the real controllers. Schemas for DTO fields come from
 * the swagger build plugin, which only runs under `nest build`, so they are
 * not asserted here.
 */
describe('OpenAPI document', () => {
  let app: INestApplication;
  let doc: OpenAPIObject;

  beforeAll(async () => {
    const stub = { execute: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ ignoreEnvFile: true, isGlobal: true })],
      controllers: [AuthController, AccountController],
      providers: [
        SameOriginGuard,
        ...[
          RegisterAccountUseCase,
          LoginAccountUseCase,
          LogoutAccountUseCase,
          RefreshAccountUseCase,
          GetAccountsUseCase,
          CreateAccountUseCase,
          ActivateAccountUseCase,
          DeactivateAccountUseCase,
        ].map((useCase) => ({ provide: useCase, useValue: stub })),
        { provide: I_AUTH_POLICY, useValue: {} },
      ],
    }).compile();

    app = configureApp(moduleRef.createNestApplication());
    await app.init();
    doc = buildOpenApiDocument(app);
  });

  afterAll(() => app.close());

  const operation = (method: string, path: string) =>
    (doc.paths[path] as Record<string, { security?: object[] }> | undefined)?.[
      method
    ];

  it('documents all eight routes under the /api prefix', () => {
    expect(
      Object.entries(doc.paths).flatMap(([path, item]) =>
        Object.keys(item).map((method) => `${method.toUpperCase()} ${path}`),
      ),
    ).toEqual(
      expect.arrayContaining([
        'POST /api/auth/register',
        'POST /api/auth/login',
        'POST /api/auth/logout',
        'POST /api/auth/refresh',
        'GET /api/accounts',
        'POST /api/accounts',
        'POST /api/accounts/activate/{accountId}',
        'POST /api/accounts/deactivate/{accountId}',
      ]),
    );
  });

  it('marks every account route as needing the bearer token', () => {
    for (const [method, path] of [
      ['get', '/api/accounts'],
      ['post', '/api/accounts'],
      ['post', '/api/accounts/activate/{accountId}'],
      ['post', '/api/accounts/deactivate/{accountId}'],
    ]) {
      expect(operation(method, path)?.security).toEqual([
        { [BEARER_AUTH]: [] },
      ]);
    }
  });

  it('marks logout and refresh as using the refresh cookie, and login and register as open', () => {
    expect(operation('post', '/api/auth/logout')?.security).toEqual([
      { [REFRESH_COOKIE_AUTH]: [] },
    ]);
    expect(operation('post', '/api/auth/refresh')?.security).toEqual([
      { [REFRESH_COOKIE_AUTH]: [] },
    ]);
    expect(operation('post', '/api/auth/login')?.security).toBeUndefined();
    expect(operation('post', '/api/auth/register')?.security).toBeUndefined();
  });

  it('declares both security schemes', () => {
    expect(doc.components?.securitySchemes).toMatchObject({
      [BEARER_AUTH]: { type: 'http', scheme: 'bearer' },
      [REFRESH_COOKIE_AUTH]: {
        type: 'apiKey',
        in: 'cookie',
        name: 'refresh_token',
      },
    });
  });
});
