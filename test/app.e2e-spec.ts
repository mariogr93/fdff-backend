import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/configure-app';

/**
 * Boots the real AppModule, so running this requires live Postgres, a populated
 * .env and keys/*.pem. Run with `npm run test:e2e`; it is not part of `npm test`.
 */
describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = configureApp(
      moduleFixture.createNestApplication(),
    ) as INestApplication<App>;
    await app.init();
  });

  it('/api (GET) reports that the API is running', () => {
    return request(app.getHttpServer())
      .get('/api')
      .expect(200)
      .expect('API is running!');
  });

  afterEach(async () => {
    await app.close();
  });
});
