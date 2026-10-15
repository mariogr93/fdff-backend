import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { resolveAllowedOrigins } from './shared/config/allowed-origins';
import { DomainExceptionFilter } from './shared/filters/domain-exception.filter';
import { requireJsonBody } from './shared/http/require-json-body';

/** Shared by bootstrap() and e2e tests so both exercise the same HTTP pipeline. */
export function configureApp(app: INestApplication): INestApplication {
  // Before Nest registers its body parsers (that happens in app.init()).
  app.use(requireJsonBody);
  app.use(cookieParser());
  app.setGlobalPrefix('api');

  // Echoes the request's Origin only when it is on the allowlist. Anything else
  // gets no CORS headers at all, so the browser blocks it. Answering `false`
  // rather than passing an Error keeps a rejected origin from becoming a 500.
  const allowedOrigins = resolveAllowedOrigins(process.env.FRONTEND_URL);
  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) => callback(null, !origin || allowedOrigins.includes(origin)),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  app.useGlobalFilters(new DomainExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  return app;
}
