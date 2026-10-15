import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './configure-app';
import { setupOpenApi } from './shared/http/setup-openapi';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  configureApp(app);

  // The API spec maps every route, so it is not served in production.
  if (process.env.NODE_ENV !== 'production') {
    setupOpenApi(app);
  }

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
