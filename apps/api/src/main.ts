import "reflect-metadata";
// Loads apps/api/.env for local dev (`pnpm --filter api dev`) and the worker
// entrypoint (Phase 10). A no-op if the file doesn't exist — Render sets real
// env vars directly in staging/production (docs/32-DEPLOYMENT.md), and this
// module is never imported by the test suite (bootstrapTestApp uses
// Test.createTestingModule directly against AppModule, not main.ts), so it
// has no effect on `configureTestEnv()`'s env setup either.
import "dotenv/config";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { AppConfigService } from "./config/config.service";

/**
 * Bootstrap. The global guard chain (rate limit → JWT auth → authorization),
 * the global exception filter, and per-route Zod validation pipes are
 * registered via CommonModule / AuthController — see
 * docs/11-SYSTEM-ARCHITECTURE.md "Component responsibilities" for what each does.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(AppConfigService).env;

  app.enableCors({ origin: config.CORS_ALLOWED_ORIGINS, credentials: true });
  app.setGlobalPrefix("api/v1", { exclude: ["health", "health/ready"] });

  const swaggerConfig = new DocumentBuilder()
    .setTitle("Hospital Platform API")
    .setDescription(
      "See docs/15-API-SPECIFICATION.md for the authoritative contract this implements.",
    )
    .setVersion("0.1.0")
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup("api/v1/docs", app, document);

  await app.listen(config.PORT);
  // eslint-disable-next-line no-console
  console.log(`API listening on port ${config.PORT}`);
}

bootstrap();
