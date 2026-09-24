import { generateKeyPairSync } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Populates every required `apiEnvSchema` variable (docs/33-ENVIRONMENT-VARIABLES.md)
 * with either a real value already present in the environment (DATABASE_URL,
 * pointing at the docker-compose Postgres per docs/30-TESTING-STRATEGY.md
 * "Test data & environment") or a self-contained test default — so
 * integration tests are runnable with nothing more than a reachable Postgres,
 * never requiring a fully-populated developer `.env`.
 */
export function configureTestEnv(): void {
  process.env.NODE_ENV = "test";
  process.env.PORT ??= "4001";

  process.env.DATABASE_URL ??= "postgresql://hospital_dev:hospital_dev_password@localhost:5432/hospital_platform";
  process.env.DIRECT_DATABASE_URL ??= process.env.DATABASE_URL;

  if (!process.env.JWT_PRIVATE_KEY || !process.env.JWT_PUBLIC_KEY) {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    process.env.JWT_PRIVATE_KEY = privateKey;
    process.env.JWT_PUBLIC_KEY = publicKey;
  }
  process.env.JWT_ACCESS_TOKEN_TTL ??= "15m";
  process.env.JWT_REFRESH_TOKEN_TTL_PATIENT ??= "30d";
  process.env.JWT_REFRESH_TOKEN_TTL_STAFF ??= "7d";

  process.env.OBJECT_STORAGE_PROVIDER ??= "local";
  process.env.OBJECT_STORAGE_LOCAL_DIR ??= join(tmpdir(), "hospital-platform-test-storage");
  process.env.OBJECT_STORAGE_BUCKET ??= "hospital-platform-test";
  process.env.OBJECT_STORAGE_SIGNED_URL_TTL ??= "600";

  process.env.EMAIL_PROVIDER_API_KEY ??= "test-email-key";
  process.env.EMAIL_FROM_ADDRESS ??= "no-reply@hospital-platform.test";
  process.env.PUSH_PROVIDER_CREDENTIALS ??= "test-push-credentials";

  process.env.QUEUE_BACKEND_URL ??= "redis://localhost:6379";

  process.env.CORS_ALLOWED_ORIGINS ??= "http://localhost:3000";
  process.env.LOG_LEVEL ??= "error";
  process.env.SUPER_ADMIN_BREAK_GLASS_ENABLED ??= "false";
}
