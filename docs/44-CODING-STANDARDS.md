# 44 — Coding Standards

Repo-wide conventions so Stage 2 code is consistent across three apps and six packages without re-deriving conventions per phase. Enforced via ESLint/Prettier config in the monorepo root ([12-MONOREPO-STRUCTURE.md](12-MONOREPO-STRUCTURE.md)) wherever a rule is mechanically enforceable; the rest is code-review discipline.

## TypeScript

- `strict: true` everywhere, no `any` without an inline comment justifying it (lint-flagged, not banned outright — some third-party type gaps genuinely need it).
- Prefer `type` for object shapes/unions, `interface` only when declaration merging is actually needed (rare — mostly irrelevant given Zod-inferred types are the norm for DTOs).
- No default exports for anything except Next.js/Expo Router page/layout files, which require them by framework convention — everything else uses named exports (better refactor-safety, better auto-import behavior).

## Naming

- Files: `kebab-case.ts` / `PascalCase.tsx` for React components.
- Variables/functions: `camelCase`. Types/interfaces/React components/classes: `PascalCase`. Constants that are truly fixed (permission keys, error codes): `SCREAMING_SNAKE_CASE`.
- Database: Prisma models `PascalCase` singular, mapped to `snake_case` plural Postgres tables via `@@map`; columns `camelCase` in Prisma, `snake_case` via `@map` — see [13-DATABASE-DESIGN.md](13-DATABASE-DESIGN.md).
- API routes: `kebab-case` plural nouns (`/lab-orders`, not `/labOrders` or `/lab_order`).
- Permission keys: `resource.action`, always lowercase, matching the canonical list in [02-PERSONAS-AND-ROLES.md](02-PERSONAS-AND-ROLES.md) exactly — never invented ad hoc in a controller.
- `User.passwordHash` is omitted by default on every read (`packages/database/src/client.ts`'s `createPrismaClient()` passes `omit: { user: { passwordHash: true } }`) — a query that `include`s/reads `user` never has to remember to strip it, and it can never leak into an HTTP response by accident. The one legitimate exception is `AuthService.login()`'s own password check, which explicitly opts back in per-query with `omit: { passwordHash: false }`. Never instantiate a bare `new PrismaClient()` to work around this — always go through `createPrismaClient()`.

## Folder/module structure

- `apps/api`: one NestJS module per domain (matches the API domain list in [15-API-SPECIFICATION.md](15-API-SPECIFICATION.md)), each with `controller`, `service`, `dto/` (re-exporting from `packages/validation` rather than redefining), and its own `*.spec.ts` files colocated.
- `apps/admin` and `apps/mobile`: feature-folder structure (`src/features/<domain>/`) containing that domain's screens/components/hooks together, rather than type-based folders (`components/`, `hooks/` split globally) — colocation over categorization, since a domain feature is what actually changes together.
- Cross-cutting UI primitives (buttons, cards, inputs per [07-DESIGN-SYSTEM.md](07-DESIGN-SYSTEM.md)) live in `packages/ui/native` or `packages/ui/web`, imported by feature folders — never redefined locally within a feature.

## NestJS-specific conventions

- Every controller method has exactly one of `@Public()` or `@RequirePermission(...)` — enforced by a custom lint rule, per [17-AUTHORIZATION-RBAC.md](17-AUTHORIZATION-RBAC.md).
- Controllers are thin: request/response shaping and guard/pipe wiring only. Business logic lives in services. A controller method longer than ~15 lines is a signal the logic belongs in the service.
- Services never construct raw HTTP responses or throw generic `Error` — they throw the typed domain exceptions mapped by the global exception filter, per [28-ERROR-HANDLING.md](28-ERROR-HANDLING.md).
- No module reaches into another module's Prisma repository or internal service methods directly — cross-module interaction goes through the other module's exported public service interface (enforced by NestJS module boundaries: don't export what shouldn't be reached).

## React / React Native conventions

- Function components only, no class components.
- Server state exclusively through TanStack Query (`useQuery`/`useMutation`); no manual `useEffect` + `fetch` data-fetching.
- Forms exclusively through React Hook Form + a `packages/validation` Zod resolver — no ad hoc `useState`-per-field forms.
- No inline styles for anything token-governed (color, spacing, typography) — always through the design-token layer ([45-DESIGN-TOKENS.md](45-DESIGN-TOKENS.md)) via `packages/ui`, so a token change never requires hunting inline style props.
- Component files stay focused: a screen component orchestrates; presentation is broken into smaller components once a single file exceeds roughly 200 lines or mixes more than one clear responsibility.

## Validation & types

- `packages/validation` Zod schemas are the single source of truth for a given DTO shape; both the NestJS DTO validation pipe and the client-side React Hook Form resolver import the same schema — never two independently-maintained schemas for one payload shape.
- Types flow from Zod (`z.infer`) into `packages/types` for re-export, not hand-duplicated.

## Comments & documentation in code

- No comments explaining *what* code does when naming already makes it clear.
- A comment is warranted only for a non-obvious *why*: a regulatory/business-rule constraint (e.g. why prescriptions are immutable), a workaround for a specific library limitation (e.g. the raw-SQL partial index Prisma can't express), or a genuinely surprising invariant.
- No commented-out code committed — delete it; git history preserves it if ever needed again.

## Commit style

- Conventional-commit-flavored subject lines (`feat(appointments): add conflict-safe booking transaction`, `fix(auth): correct OTP expiry check`) — not enforced by a strict changelog-generation tool in MVP, but followed as a readability convention so `git log` stays a useful project history.
- One logical change per commit; a migration and the code that depends on it land together, not split across unrelated commits.

## Testing conventions

- Test files colocated as `*.spec.ts`/`*.spec.tsx` next to the code they test (unit/component) or under `apps/api/test/` for integration/E2E suites, per [30-TESTING-STRATEGY.md](30-TESTING-STRATEGY.md).
- Test names read as a sentence describing the behavior under test (`it('rejects a reschedule beyond the policy window without an override reason', ...)`), not implementation-detail descriptions (`it('calls the reschedule method', ...)`).

## Linting & formatting

- Prettier for formatting (no config debates — one shared `.prettierrc` at the root, no per-package overrides).
- ESLint with the shared root config; `eslint-plugin-jsx-a11y` (admin) and `eslint-plugin-react-native-a11y` (mobile) are required, not optional, per [10-ACCESSIBILITY.md](10-ACCESSIBILITY.md).
- The local quality-gate script (`pnpm quality`) fails on any lint error (not just warnings-as-advisory) — see [30-TESTING-STRATEGY.md](30-TESTING-STRATEGY.md)'s local quality gate.
