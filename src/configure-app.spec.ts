import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { configureApp } from './configure-app';

const FIRST = 'https://app.fdff.test';
const SECOND = 'https://admin.fdff.test';

/**
 * Builds the app the way main.ts does, so the CORS behaviour asserted here is
 * the one a browser meets. FRONTEND_URL is read when configureApp runs, so each
 * test sets it before building.
 */
describe('configureApp CORS', () => {
  const original = process.env.FRONTEND_URL;
  let app: INestApplication<App>;

  async function build(frontendUrl: string | undefined): Promise<void> {
    if (frontendUrl === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = frontendUrl;

    const moduleRef = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    app = configureApp(
      moduleRef.createNestApplication(),
    ) as INestApplication<App>;
    await app.init();
  }

  const preflight = (origin: string) =>
    request(app.getHttpServer())
      .options('/api')
      .set('Origin', origin)
      .set('Access-Control-Request-Method', 'POST');

  afterEach(async () => {
    await app.close();
    if (original === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = original;
  });

  describe('with two allowed origins', () => {
    beforeEach(() => build(`${FIRST}, ${SECOND}`));

    it.each([FIRST, SECOND])('echoes the allowed origin %s', async (origin) => {
      const res = await preflight(origin);

      expect(res.headers['access-control-allow-origin']).toBe(origin);
      expect(res.headers['access-control-allow-credentials']).toBe('true');
    });

    it.each(['https://evil.test', 'null', `${FIRST}.evil.test`, `${FIRST}/`])(
      'sends no CORS headers to %s',
      async (origin) => {
        const res = await preflight(origin);

        expect(res.headers['access-control-allow-origin']).toBeUndefined();
        expect(res.headers['access-control-allow-credentials']).toBeUndefined();
      },
    );

    it('answers a rejected origin without an error status', async () => {
      const res = await request(app.getHttpServer())
        .get('/api')
        .set('Origin', 'https://evil.test');

      expect(res.status).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('serves a request that has no Origin header (curl, server to server)', async () => {
      const res = await request(app.getHttpServer()).get('/api');

      expect(res.status).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('with FRONTEND_URL unset (development and test only)', () => {
    beforeEach(() => build(undefined));

    it('allows the Vite dev server and nothing else', async () => {
      const dev = await preflight('http://localhost:5173');
      const other = await preflight(FIRST);

      expect(dev.headers['access-control-allow-origin']).toBe(
        'http://localhost:5173',
      );
      expect(other.headers['access-control-allow-origin']).toBeUndefined();
    });
  });
});
