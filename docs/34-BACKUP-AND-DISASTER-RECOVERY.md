# 34 — Backup and Disaster Recovery

## Objectives

| Metric | Target |
|---|---|
| **RPO** (Recovery Point Objective) — max acceptable data loss | 5 minutes (via continuous WAL archiving on top of daily base backups) |
| **RTO** (Recovery Time Objective) — max acceptable downtime to restore | 4 hours for a full production restore from backup |

These are stated as MVP-reasonable targets appropriate for a clinical-adjacent but non-life-critical (appointments/records, not real-time monitoring) system; a hospital with stricter regulatory RPO/RTO requirements would need this revisited — flagged for user input if the target deployment has a specific compliance-driven requirement.

## What is backed up

- **PostgreSQL:** Supabase's built-in daily backups + point-in-time recovery (available on Supabase's paid plans; the free tier retains daily backups for 7 days without PITR — plan tier is a Stage 2 setup decision informed by how long the demo needs to stay recoverable, not fixed here). See [32-DEPLOYMENT.md](32-DEPLOYMENT.md) for the Supabase-per-environment topology.
- **Object storage (reports/documents):** Supabase Storage's own durability guarantees; since all content is synthetic fixture data per [26-PRIVACY-AND-DATA-PROTECTION.md](26-PRIVACY-AND-DATA-PROTECTION.md), the practical fallback for object storage loss is simply re-running the seed script ([36-SEED-DATA.md](36-SEED-DATA.md)) rather than restoring from a backup — a real deployment with genuine uploaded files would need actual bucket versioning/replication, out of scope for this project's confirmed demo posture.
- **Application configuration/secrets:** version-controlled (non-secret config) or held in the secret manager with its own backup/versioning (secrets) — not part of the database backup, tracked separately.
- **Audit logs:** covered by the same PostgreSQL backup as the rest of the database; given their append-only nature and compliance value, point-in-time recovery specifically protects against ever losing audit history to an operational incident.

## What is explicitly not relied upon

Application-level "soft delete" is a data-model safety net (see [13-DATABASE-DESIGN.md](13-DATABASE-DESIGN.md)), not a backup strategy — it protects against accidental logical deletion within normal operation, not against database corruption, provider outage, or catastrophic infrastructure failure, which is what the backup/DR plan exists for.

## Restore procedure (outline)

1. Identify the target recovery point (latest, or a specific point-in-time before an incident).
2. Provision a new database instance from the backup/WAL stream (managed-provider restore workflow).
3. Point a staging-equivalent API instance at the restored database, run a smoke-test pass (auth, a sample read/write per domain, tenant-isolation spot-check) before cutting production traffic over.
4. Cut production traffic to the restored instance; keep the pre-incident instance retained (not destroyed) for forensic comparison until the incident is closed.
5. Post-incident review documented (root cause, timeline, what data/time window was affected) and communicated per the hospital's/platform's incident-notification obligations (see the regulatory open decision in [26-PRIVACY-AND-DATA-PROTECTION.md](26-PRIVACY-AND-DATA-PROTECTION.md) — breach/incident notification requirements are jurisdiction-dependent).

## Testing the backup

A restore drill (restoring the most recent backup into an isolated environment and running the smoke-test pass above) is performed on a recurring schedule (recommended quarterly) as part of production readiness upkeep — an untested backup is not a reliable backup. Tracked as an ongoing operational task in [42-PROJECT-STATE.md](42-PROJECT-STATE.md) once the platform is live, not a one-time Stage 2 deliverable.

## High availability (beyond backup/restore)

- Managed Postgres with a standby replica (synchronous or near-synchronous) for automatic failover, reducing the practical RTO for infrastructure-level (not data-corruption-level) failures well below the 4-hour target — the 4-hour RTO specifically covers the harder case of restoring from backup, not routine failover.
- API/worker are stateless and horizontally deployed behind a load balancer, so individual instance failure doesn't require a "disaster recovery" procedure at all — it's routine autoscaling/health-check replacement.
