import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { seedCatalog, type PrismaClient } from "@hospital/database";
import { AppModule } from "../src/app.module";
import type { AiReportAssistProvider } from "@hospital/shared";
import { PrismaService } from "../src/prisma/prisma.service";
import { AI_REPORT_ASSIST_PROVIDER } from "../src/storage/storage.tokens";
import { configureTestEnv } from "./test-env";

/**
 * Boots a full Nest application (every global guard/filter from
 * CommonModule included, exactly as main.ts does) against a real database,
 * and seeds the permission/role/medication catalog once — every domain
 * module Phase 3 onward needs it. Callers are responsible for their own
 * per-test data cleanup; this only guarantees the catalog exists.
 *
 * Rate limiting is swapped for a no-op automatically because
 * `configureTestEnv()` sets `NODE_ENV=test` — see CommonModule and
 * NoopRateLimitGuard for why. Without that, the 4th+ test case calling
 * `/auth/register` (an IP-keyed, 5-per-hour route) would start failing
 * purely because earlier test cases in the same run already "used up" the
 * bucket — a false failure about test ordering, not about auth behavior,
 * which is what this suite verifies.
 */
export async function bootstrapTestApp(
  options: { aiProvider?: AiReportAssistProvider } = {},
): Promise<{ app: INestApplication; prisma: PrismaService }> {
  configureTestEnv();

  const builder = Test.createTestingModule({ imports: [AppModule] });
  // The report pipeline's AI stage is stubbed per suite — no test ever reaches a real provider.
  if (options.aiProvider) {
    builder.overrideProvider(AI_REPORT_ASSIST_PROVIDER).useValue(options.aiProvider);
  }
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication();
  // Must mirror main.ts's bootstrap() exactly — a TestingModule's
  // createNestApplication() does NOT run main.ts, so anything configured
  // there (global prefix, CORS, ...) has to be repeated here or routes
  // silently 404 against the prefix real clients actually use.
  app.setGlobalPrefix("api/v1", { exclude: ["health", "health/ready"] });
  await app.init();

  const prisma = app.get(PrismaService);
  // See seedCatalog's docstring: the soft-delete-extended client is
  // runtime-identical to PrismaClient for the models this touches, but not
  // structurally assignable to it at the type level.
  await seedCatalog(prisma.client as unknown as PrismaClient);

  return { app, prisma };
}
