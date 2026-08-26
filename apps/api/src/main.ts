import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";

/**
 * Phase 1 bootstrap: app boots, listens, and serves Swagger + health checks.
 * Global validation pipe, authorization guard, audit interceptor, and exception
 * filter are added in Phase 3 (docs/40-ROADMAP.md, task T-301) — see
 * docs/11-SYSTEM-ARCHITECTURE.md "Component responsibilities" for what each does.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix("api/v1", { exclude: ["health", "health/ready"] });

  const config = new DocumentBuilder()
    .setTitle("Hospital Platform API")
    .setDescription(
      "See docs/15-API-SPECIFICATION.md for the authoritative contract this implements.",
    )
    .setVersion("0.1.0")
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("api/v1/docs", app, document);

  const port = process.env.PORT ? Number(process.env.PORT) : 4000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`API listening on port ${port}`);
}

bootstrap();
