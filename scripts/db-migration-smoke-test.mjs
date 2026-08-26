#!/usr/bin/env node
/**
 * Local migration smoke test (docs/41-TASKS.md task T-206, docs/30-TESTING-STRATEGY.md
 * "Test data & environment"). Spins up a throwaway ephemeral Postgres container
 * (separate from the persistent `docker compose up -d postgres` dev database —
 * this never touches a developer's own data), applies every migration in
 * packages/database/prisma/migrations with `prisma migrate deploy`, runs a
 * handful of smoke queries confirming the schema — including the hand-written
 * partial indexes and check constraint documented in
 * docs/38-DATABASE-MIGRATIONS.md — actually landed, then tears the container down.
 *
 * Requires Docker. Run via: pnpm db:migration-smoke-test (root) or node
 * scripts/db-migration-smoke-test.mjs directly.
 *
 * Not runtime-verified in every environment this repository is developed in —
 * see docs/42-PROJECT-STATE.md for which environment last confirmed this script
 * passes end-to-end.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const databaseDir = path.join(repoRoot, "packages", "database");

const CONTAINER_NAME = "hospital-platform-migration-smoke-test";
const PORT = 55499;
const DB_URL = `postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres`;

function run(cmd, args, opts = {}) {
  console.log(`$ ${cmd} ${args.join(" ")}`);
  return execFileSync(cmd, args, { stdio: "inherit", ...opts });
}

function checkDockerAvailable() {
  const result = spawnSync("docker", ["--version"], { stdio: "pipe" });
  if (result.status !== 0) {
    console.error(
      "[migration-smoke-test] Docker is required and was not found on PATH. " +
        "Install Docker Desktop (or an equivalent) and re-run — see docs/32-DEPLOYMENT.md.",
    );
    process.exit(1);
  }
}

async function waitForPostgresReady(maxAttempts = 30) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = spawnSync("docker", ["exec", CONTAINER_NAME, "pg_isready", "-U", "postgres"], {
      stdio: "pipe",
    });
    if (result.status === 0) return;
    await sleep(1000);
  }
  throw new Error("Postgres did not become ready in time.");
}

async function main() {
  checkDockerAvailable();

  // Always start from a clean slate — remove any stale container from a
  // previous interrupted run before starting a new one.
  spawnSync("docker", ["rm", "-f", CONTAINER_NAME], { stdio: "pipe" });

  try {
    console.log("[migration-smoke-test] Starting ephemeral Postgres container...");
    run("docker", [
      "run", "-d",
      "--name", CONTAINER_NAME,
      "-e", "POSTGRES_PASSWORD=postgres",
      "-p", `${PORT}:5432`,
      "postgres:16-alpine",
    ]);

    console.log("[migration-smoke-test] Waiting for Postgres to accept connections...");
    await waitForPostgresReady();

    console.log("[migration-smoke-test] Running `prisma migrate deploy`...");
    run("npx", ["prisma", "migrate", "deploy"], {
      cwd: databaseDir,
      env: { ...process.env, DATABASE_URL: DB_URL, DIRECT_DATABASE_URL: DB_URL },
    });

    console.log("[migration-smoke-test] Running smoke queries...");
    const client = new pg.Client({ connectionString: DB_URL });
    await client.connect();
    try {
      const tables = await client.query(
        "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'",
      );
      assertTrue(tables.rows[0].n >= 30, `Expected at least 30 tables, found ${tables.rows[0].n}`);

      const partialIndexes = await client.query(
        "SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname LIKE '%active_key'",
      );
      const indexNames = partialIndexes.rows.map((r) => r.indexname).sort();
      assertTrue(
        indexNames.includes("appointments_doctor_id_start_time_active_key"),
        "Missing appointment conflict-prevention partial unique index — see docs/19-APPOINTMENT-ENGINE.md.",
      );
      assertTrue(
        indexNames.includes("roles_system_key_active_key"),
        "Missing system-role uniqueness partial index — see docs/38-DATABASE-MIGRATIONS.md.",
      );

      const checkConstraint = await client.query(
        "SELECT conname FROM pg_constraint WHERE conname = 'users_email_or_phone_present_check'",
      );
      assertTrue(checkConstraint.rows.length === 1, "Missing users email-or-phone check constraint.");

      console.log("[migration-smoke-test] All smoke checks passed.");
    } finally {
      await client.end();
    }
  } finally {
    console.log("[migration-smoke-test] Tearing down the ephemeral container...");
    spawnSync("docker", ["rm", "-f", CONTAINER_NAME], { stdio: "pipe" });
  }
}

function assertTrue(condition, message) {
  if (!condition) {
    throw new Error(`[migration-smoke-test] FAILED: ${message}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
