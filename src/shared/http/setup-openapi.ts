import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export const OPENAPI_UI_PATH = 'api/docs';
export const OPENAPI_JSON_PATH = 'api/docs-json';

/** Security scheme names, shared by the document and the controller decorators. */
export const BEARER_AUTH = 'access-token';
export const REFRESH_COOKIE_AUTH = 'refresh-cookie';

export function buildOpenApiDocument(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('FDFF API')
    .setDescription(
      'Federación Dominicana de Fisicoculturismo y Fitness. Auth routes accept JSON only and refuse foreign origins.',
    )
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      BEARER_AUTH,
    )
    .addCookieAuth('refresh_token', undefined, REFRESH_COOKIE_AUTH)
    .build();

  return SwaggerModule.createDocument(app, config);
}

/**
 * Serves the Swagger UI at /api/docs and the raw spec at /api/docs-json, for
 * the frontend to generate its types from. main.ts calls this outside
 * production only: the spec maps every route and is not meant to be public.
 */
export function setupOpenApi(app: INestApplication): void {
  SwaggerModule.setup(OPENAPI_UI_PATH, app, () => buildOpenApiDocument(app), {
    jsonDocumentUrl: OPENAPI_JSON_PATH,
  });
}
