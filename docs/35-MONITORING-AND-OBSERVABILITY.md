# 35 — Monitoring and Observability

## Structured logging

- All API/worker logs are structured JSON (one object per line), never free-text string concatenation — required for reliable downstream querying/alerting.
- Standard fields on every log line: `timestamp`, `level`, `message`, `requestId` (correlates all log lines for one request, generated at the edge/entry middleware and propagated through async job processing via the job payload), `userId` (when authenticated), `hospitalId` (when resolved), `route`/`jobName`.
- Sensitive-content logging rules per [26-PRIVACY-AND-DATA-PROTECTION.md](26-PRIVACY-AND-DATA-PROTECTION.md) apply identically here — this document covers mechanics, that one covers what's forbidden.
- `LOG_LEVEL` (see [33-ENVIRONMENT-VARIABLES.md](33-ENVIRONMENT-VARIABLES.md)) controls verbosity per environment: `debug` locally, `info` in staging/production, with `warn`/`error` always emitted regardless of level.

## Metrics

| Category | Examples |
|---|---|
| **Request-level** | Request rate, latency (P50/P95/P99) per route, error rate (4xx vs 5xx) per route |
| **Business** | Bookings/hour, booking conflict rate (`APPOINTMENT_CONFLICT` frequency — a leading indicator of popular-slot contention or a UX problem if unexpectedly high), check-in rate, notification delivery success rate per channel |
| **Infrastructure** | Database connection pool utilization, queue depth/processing lag, object storage request latency |
| **Security** | Failed login rate, account lockout rate, refresh-token-reuse detection count (should be ~zero in normal operation — any non-trivial rate is itself an alert-worthy signal) |

Metrics are exported in a standard format (Prometheus-compatible `/metrics` endpoint, or push to the hosting platform's native metrics service — specific backend is a deployment-environment decision, not fixed here) and are tenant-aggregated only, never broken out by `hospitalId` in a way that would make the metrics backend itself a clinical-data-adjacent system requiring the same access controls as the primary database.

## Tracing

Distributed tracing (via OpenTelemetry instrumentation in NestJS) correlates a request across the API, database queries, and any enqueued job it triggers, using the same `requestId` propagated through structured logs — primarily valuable for diagnosing latency in the booking/consultation paths where multiple downstream calls (DB transaction, notification enqueue) compose into one user-facing request.

## Alerting

| Signal | Alert condition (indicative, tuned during Stage 2 operational hardening) |
|---|---|
| Error rate | 5xx rate > 1% of requests over 5 minutes |
| Latency | P95 latency exceeds the budgets in [01-PRODUCT-REQUIREMENTS.md](01-PRODUCT-REQUIREMENTS.md) sustained over 5 minutes |
| Queue backlog | Job queue depth growing faster than drain rate for 10+ minutes (notifications/AI-analysis backing up) |
| Notification delivery | Delivery success rate for any channel drops below 95% over 1 hour |
| Security | Any `AUTH_REFRESH_TOKEN_REUSED` event (page immediately — treat as a possible active credential-theft incident); lockout rate spike (possible credential-stuffing attempt) |
| Database | Connection pool exhaustion; replica lag beyond a threshold |
| Backup | Scheduled backup job failure (see [34-BACKUP-AND-DISASTER-RECOVERY.md](34-BACKUP-AND-DISASTER-RECOVERY.md)) |

Alerts route to an on-call channel/rotation — specific paging tool (PagerDuty-equivalent) is a deployment-environment decision left open, consistent with [32-DEPLOYMENT.md](32-DEPLOYMENT.md)'s stance on unspecified infrastructure choices.

## Health checks

- `GET /health` (liveness — is the process up) and `GET /health/ready` (readiness — can it serve traffic: DB reachable, queue reachable) exposed by the API, used by the load balancer/orchestrator for routing and restart decisions, and by the deployment pipeline to gate traffic cutover after a rollout.
- Worker processes expose an equivalent liveness signal (e.g. a periodic heartbeat write checked by an external monitor) since they don't serve HTTP traffic directly.

## Error tracking

Unhandled exceptions (the `INTERNAL_ERROR` path in [28-ERROR-HANDLING.md](28-ERROR-HANDLING.md)) are additionally captured by an APM/error-tracking tool (Sentry-equivalent, per the `SENTRY_DSN` variable in [33-ENVIRONMENT-VARIABLES.md](33-ENVIRONMENT-VARIABLES.md)) with request context attached (minus sensitive payload content, scrubbed per the same logging-hygiene rules) — this is what actually gets triaged day-to-day, with structured logs serving as the deeper-dive source once an incident is identified.

## Dashboards

A small set of operational dashboards (not the same as the in-product hospital Analytics dashboard, which is a customer-facing feature — this is internal engineering observability): request health overview, business-metric overview, security-signal overview, queue/worker health — assembled from the metrics above once a metrics backend is chosen in Stage 2.
