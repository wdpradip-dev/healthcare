# 32 — Deployment

Resolved hosting decisions (user-confirmed, [ADR-011](43-ARCHITECTURE-DECISIONS.md)): **Vercel** (admin console), **Render** (API + worker), **Supabase** (PostgreSQL + object storage). Source control has a **GitHub remote** (`github.com/wdpradip-dev/healthcare`) for backup/history, but there is still **no hosted CI/CD** — GitHub is not wired to any of the three hosting platforms, and deploys are still triggered manually via each platform's CLI. This is appropriate for the project's confirmed scope as a learning/demo build on synthetic data ([26-PRIVACY-AND-DATA-PROTECTION.md](26-PRIVACY-AND-DATA-PROTECTION.md)), not a high-availability production service.

## Environments

| Environment | Purpose | Data |
|---|---|---|
| Local | Individual developer machine | `docker-compose`, disposable/seeded |
| Staging | Pre-launch validation, mirrors the deployed config on Vercel/Render/Supabase | Synthetic/fixture data only |
| "Production" | The live demo instance | Synthetic/fixture data only — real patient data is never entered anywhere, per the confirmed regulatory scope |

There is no separate shared "Development" environment beyond Local — with no CI/CD pipeline to feed one, a third pre-staging environment adds operational overhead without a corresponding benefit for this project's scope. Staging and Production are two distinct Vercel projects / Render services / Supabase projects (not two branches of the same deployment), so testing against Staging can never accidentally touch Production data.

## Local development (`docker-compose.yml`)

Services: `postgres` (named volume, standing in for Supabase locally), `object-storage` (MinIO, S3-compatible, standing in for Supabase Storage locally — both speak the same abstraction, see [21-REPORTS-AND-DOCUMENTS.md](21-REPORTS-AND-DOCUMENTS.md)). The API/worker/admin run directly via `pnpm`, not containerized in local dev, for faster iteration (hot reload without an image rebuild loop):

```
docker compose up postgres object-storage
pnpm --filter api db:migrate
pnpm --filter api db:seed
pnpm --filter api dev
pnpm --filter worker dev
pnpm --filter admin dev
pnpm --filter mobile start
```

Mobile runs via Expo CLI against the local API's LAN-reachable URL, not inside Docker.

## Staging & "Production" topology

- **Admin console → Vercel.** Next.js deployed as a Vercel project (server components + server-rendered auth work natively on Vercel's Node runtime). Two Vercel projects (or two environments within one project, using Vercel's environment variable scoping) for Staging/Production, each pointed at its own Render API URL and Supabase project.
- **API + Worker → Render.** Two Render Web Services (API, publicly routable) plus a Render Background Worker (job queue consumer) per environment, built from the `apps/api` Dockerfile. Render provides TLS termination, health-check-driven restarts, and horizontal scaling (paid tiers) out of the box — no separate load balancer/reverse-proxy layer needs to be operated by hand.
- **Database + Object storage → Supabase.** One Supabase project per environment, providing managed PostgreSQL (with connection pooling via Supabase's pooler, important for Render's serverless-adjacent connection patterns) and Supabase Storage (S3-compatible) for the object-storage abstraction's hosted implementation. Supabase's built-in point-in-time recovery covers [34-BACKUP-AND-DISASTER-RECOVERY.md](34-BACKUP-AND-DISASTER-RECOVERY.md)'s RPO/RTO targets without separate backup tooling.
- **Mobile:** distributed via EAS Build — Android APK for internal/QA testing (`eas build --profile preview`), AAB for Play Store release (`eas build --profile production`); OTA updates via EAS Update for JS-only changes between store releases where appropriate. EAS is Expo's own build service, triggered from the local CLI, independent of GitHub either way.

## Database migrations in deployment

Migrations run as a manual, explicit step **before** deploying new API code that depends on them: `pnpm --filter database db:migrate:deploy` (wraps `prisma migrate deploy`) run locally against the target environment's Supabase connection string, immediately followed by triggering the Render deploy. Same expand/contract discipline as before applies — see [38-DATABASE-MIGRATIONS.md](38-DATABASE-MIGRATIONS.md) — it matters just as much for a manually-sequenced deploy as for a pipeline-automated one, since Render can still briefly run old and new instances side by side during a rolling deploy.

## Manual deployment workflow (no hosted CI/CD)

GitHub hosts the source repository, but nothing there is wired to trigger a deploy automatically — there is no GitHub Actions workflow. Deploys are a manual, human-run sequence:

1. **Before every deploy, run the local quality gate:** `pnpm quality` (a root script chaining lint → type-check → unit tests → integration tests → the authorization/tenant-isolation suite, per [30-TESTING-STRATEGY.md](30-TESTING-STRATEGY.md)). A deploy is never triggered on code that hasn't passed this locally.
2. **Database:** run pending migrations against the target Supabase project (see above).
3. **API + Worker:** `render deploy` (Render CLI), or connect the Render service directly to the `wdpradip-dev/healthcare` GitHub repo via Render's own GitHub integration if a git-push-triggered deploy is ever wanted — either is acceptable and the specific choice is a Stage 2 setup-time detail; the default assumption in this document remains the manual CLI trigger.
4. **Admin:** `vercel deploy --prod` (or `vercel deploy` for a Staging preview) via the Vercel CLI from the local `apps/admin` build — Vercel similarly offers a GitHub-integration auto-deploy option that is not enabled by default here.
5. **Mobile:** `eas build` + `eas submit`/OTA update as needed, independent of the above.
6. **Smoke test:** a short manual checklist (login, one read, one write, one file access) run against the freshly-deployed environment before considering the deploy complete — see [39-PRODUCTION-READINESS.md](39-PRODUCTION-READINESS.md).

This workflow is intentionally simple, matching the project's confirmed scope (learning/demo, synthetic data, no team of engineers needing a shared automated pipeline). If the project ever grows beyond that scope, adding a GitHub Actions workflow is now a lower-effort addition than before (the repo already exists on GitHub) layered on top of this same manual workflow, not a redesign of it — but that step has not been taken and should not be assumed.

## Rollback

- **API/Worker (Render):** redeploy the previous successful deploy from Render's deploy history (one click / one CLI command) — Render retains prior build artifacts for exactly this purpose.
- **Admin (Vercel):** Vercel's deployment history supports instant rollback to any previous deployment via the dashboard or `vercel rollback`.
- **Database:** forward-only migrations in normal operation; a genuinely broken migration is fixed with a new forward migration, not a destructive rollback against a database that may have already accepted writes under the new schema — see [38-DATABASE-MIGRATIONS.md](38-DATABASE-MIGRATIONS.md). Supabase point-in-time recovery is the backstop for anything a forward migration can't fix cleanly.

## Secrets & config in deployment

Injected via each platform's own environment-variable configuration (Render's environment group per service, Vercel's project environment variables, scoped per Staging/Production) at deploy time — never committed, never baked into images, never passed through GitHub Actions secrets (since none are used). Full variable catalog: [33-ENVIRONMENT-VARIABLES.md](33-ENVIRONMENT-VARIABLES.md).
