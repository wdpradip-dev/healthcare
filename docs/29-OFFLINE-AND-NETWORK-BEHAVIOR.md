# 29 — Offline and Network Behavior

Scope: mobile app only (the admin console assumes a working broadband connection typical of a front-desk/office environment; it shows a standard "connection lost" banner and pauses mutations, but does not attempt offline support).

## Principle

**Reads may degrade gracefully; sensitive writes never do.** A patient can look at stale cached data when offline, but cannot book, cancel, or otherwise mutate an appointment, and cannot create/modify clinical data offline — clinical and scheduling correctness depend on live server state (see [19-APPOINTMENT-ENGINE.md](19-APPOINTMENT-ENGINE.md)'s concurrency guarantees, which only hold for requests that actually reach the server).

## Connectivity states

| State | Behavior |
|---|---|
| **Online** | Normal operation. |
| **No internet** | TanStack Query serves cached data for already-fetched screens with a persistent "Offline — showing saved data" banner; screens with no cached data show an offline empty state ("You're offline — connect to load this") instead of an infinite spinner. All mutation entry points (Book, Reschedule, Cancel, Check-in, Upload) are disabled with an inline explanation, not silently queued. |
| **Slow internet** | Requests proceed normally but the UI shows a request-in-flight indicator past a threshold (e.g. 3s) rather than appearing frozen; TanStack Query's built-in timeout/retry (capped retries, exponential backoff) governs request-level behavior. |
| **API unavailable (5xx / health-check failing)** | Treated similarly to "no internet" from the UI's perspective — cached reads with a banner, writes blocked — since the client can't distinguish "my network is down" from "the server is down" in any way that changes correct UI behavior. |
| **Request timeout** | Mutating requests use a bounded timeout (e.g. 15s); on timeout the UI shows "This is taking longer than expected" with a manual retry action — mutations are **never** auto-retried silently, because a timed-out booking request might have actually succeeded server-side, and blind retry could double-book intent (the idempotency key mechanism in [15-API-SPECIFICATION.md](15-API-SPECIFICATION.md) makes a manual retry-tap safe even if the original request did land). |
| **Authentication expires mid-session** | Silent refresh attempt; on failure, in-flight forms preserve their entered (not-yet-submitted) data where feasible and route to re-login, returning the user to where they were afterward rather than discarding their input. |
| **Upload fails (report/document)** | Upload progress UI shows a clear failure state with "Retry" (not auto-retried in the background, since silently retrying a large file upload on a flaky connection can surprise the user with unexpected data usage); partial uploads are not resumed in MVP (retry re-uploads from the start — resumable upload is a Post-MVP enhancement). |

## No unsafe offline modification of sensitive data

There is no local write-then-sync queue for `Appointment`, `Consultation`, `Prescription`, `LabReport`, or any other clinical/scheduling entity. This is a deliberate simplification, not an oversight — the [19-APPOINTMENT-ENGINE.md](19-APPOINTMENT-ENGINE.md) conflict-prevention model is fundamentally online-transactional (correctness comes from a database constraint evaluated at write time), and clinical documentation authorship happens on the admin console (desktop/tablet, assumed-connected) rather than the offline-capable mobile app, per the scope decision in [05-MOBILE-APP-SPECIFICATION.md](05-MOBILE-APP-SPECIFICATION.md). The only mobile-side data entry that could be tempting to queue offline — Documents upload — is intentionally also blocked offline rather than queued, to avoid a confusing "upload appears complete locally but hasn't reached the server" state for something as consequential as a medical document.

## Caching policy

- TanStack Query cache: read-heavy, low-volatility data (doctor profiles, department lists, hospital info) cached with a longer `staleTime` (e.g. 5 minutes); volatile data (availability, appointment status, notifications) cached with a short `staleTime` (e.g. 30 seconds) and refetched on screen focus.
- Cached data displayed while stale/offline is visually marked (a subtle "Last updated Xm ago" or the offline banner) so a patient never mistakes stale availability for a live guarantee — the actual booking attempt is always re-validated server-side regardless of what the cached availability screen showed.
- No cached data includes anything a permission check would currently deny — cache entries are keyed per-user-session and cleared on logout, so a shared/reused device never surfaces a previous user's cached clinical data.

## Background/reconnection behavior

On reconnection (network state transition detected), TanStack Query's `refetchOnReconnect` invalidates and refetches all currently-mounted queries; the appointment list and notification badge specifically force-refresh so a patient who was offline during an important status change (e.g. their appointment was cancelled by the hospital) sees correct state promptly rather than stale cached "Confirmed."
