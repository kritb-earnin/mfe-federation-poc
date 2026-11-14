# Session Coordination Across Framework-Agnostic Microfrontends

**Status:** Draft for user review  
**Date:** 2026-11-14  
**Type:** Runnable proof-of-concept (not production authentication)

## 1. Goal

Demonstrate that a Modern.js shell can own session coordination and supply a framework-neutral session capability to independently mounted remotes via Module Federation.

Prove:

1. Remotes receive the same shell-owned session capability (per host instance).
2. The public contract does not depend on Modern.js, React, or Zustand.
3. Late-mounted remotes receive the current session.
4. Account changes and logout do not expose obsolete-context data.
5. TanStack Query and Apollo Client remain remote-owned.
6. Remotes can unmount/remount without subscription leaks.

Additionally (user-selected scope expansion): implement **three DI styles** as separate Modern.js shells for comparison, while sharing remotes and mock-api.

## 2. Decisions locked in brainstorming

| Topic | Choice |
| --- | --- |
| DI styles | Implement A (injected), B (federated accessor), and C (shared Zustand package) |
| Packaging | Three separate Modern.js shell apps |
| Remotes build | Rsbuild + Module Federation for both remotes |
| In-flight mutations | Allow completion under original context; never auto-retry under new account |
| Overall approach | Three Modern.js v3 shells + shared remotes/mock-api/packages |

## 3. Technology versions

Pinned from current official docs at design time; implementation MUST re-check npm before lockfile commit:

| Package / stack | Selection |
| --- | --- |
| Shell framework | Modern.js v3 (`@modern-js/app-tools`, `@modern-js/runtime`) |
| MF for Modern.js | `@module-federation/modern-js-v3` |
| Remotes bundler | Rsbuild + official Module Federation Rsbuild plugin |
| Session store (internal) | Zustand vanilla |
| React data | TanStack Query |
| Vue data | Apollo Client core (no React Apollo) |
| Language | TypeScript |
| E2E | Playwright |
| Workspace | pnpm (committed lockfile) |
| Rendering | CSR default for this POC |

If an integration is unsupported, document the issue and choose the smallest working adjustment. Do not replace Modern.js silently.

## 4. Repository structure

```
apps/
  shell-injected/       # DI A — primary demo + full E2E
  shell-federated/      # DI B
  shell-zustand/        # DI C
  remote-react/
  remote-vue/
  mock-api/
packages/
  platform-contracts/   # dependency-light types + runtime validators
  session-coordinator/  # Zustand vanilla coordinator (A & B)
  shared-session-store/ # DI C only — intentional coupling demo
  test-support/
tests/
  e2e/
docs/
  architecture.md
  decisions/
  measurement-plan.md
  limitations.md
  superpowers/specs/    # this design
AGENTS.md
README.md
```

## 5. Ownership model

- **Shell (per host instance):** exactly one session coordinator, remote registry, transition orchestration, debug UI.
- **Remotes:** own QueryClient / ApolloClient, domain caches, local feature state; consume session only through the DI capability for that shell.
- **mock-api:** fictional users/accounts; REST + GraphQL; delay/fail controls; request-scope enforcement. Not production auth. Client-sent accountId is not sufficient authorization.
- **platform-contracts:** types and small validators only — no store instance.
- Instance identity is guaranteed by shell construction + mount injection (A) or by the host that exposes the federated accessor (B). Do not use a browser global as the primary DI mechanism. Package-level singletons are used only in C to demonstrate the anti-pattern.

## 6. Public platform contract

```ts
type SessionStatus =
  | "initializing"
  | "authenticated"
  | "anonymous"
  | "transitioning"
  | "error";

type SessionSnapshot = {
  status: SessionStatus;
  subjectId?: string;
  accountId?: string;
  contextRevision: number;
};

interface SessionApi {
  readonly contractVersion: 1;
  getSnapshot(): Readonly<SessionSnapshot>;
  subscribe(onChange: () => void): () => void;
  requestLogin(): Promise<void>;
  requestLogout(): Promise<void>;
  requestAccountChange(accountId: string): Promise<void>;
}
```

Rules:

- Return a stable immutable snapshot reference until state actually changes.
- `contractVersion` is independent of `contextRevision`.
- Commands resolve when the new snapshot is published; reject on failure, timeout, or supersession (`TransitionSuperseded`).
- Do not expose raw Zustand stores, `setState`, tokens, or query clients.
- Validate external inputs (e.g. `accountId`) at boundaries.

## 7. Mount and lifecycle contract

```ts
mount(element: HTMLElement, capabilities: MountCapabilities): MountHandle;

interface MountHandle {
  lifecycle: RemoteLifecycle;
  unmount(): void;
}

interface RemoteLifecycle {
  prepareTransition(ctx: TransitionContext): Promise<void>;
  resetIdentityState(ctx: TransitionContext): Promise<void>;
  resume(ctx: TransitionContext): Promise<void>;
  block(reason: RemoteBlockReason): void;
  dispose(): void;
}
```

- Shell loads remotes via Module Federation and calls exported `mount`.
- Read/subscribe alone is **not** proof that cleanup completed.
- Registry: remotes register on mount, unregister on unmount/dispose.
- Late mount during transition: register; receive `transitioning` snapshot; stay paused until resume or block.
- Transition timeout: per-remote prepare/reset timeouts; timed-out remote is fail-closed (blocked or unmounted).
- Competing commands: single-flight; newer request supersedes; in-flight promise rejects with `TransitionSuperseded`.
- Keep protocol small — not a generic workflow engine.

### Capability shapes by DI mode

| Mode | How remotes obtain SessionApi |
| --- | --- |
| A Injected | `mount(el, { session })` |
| B Federated | Federated `shellSession.getSessionApi()` (same host coordinator) |
| C Shared Zustand | Import `@poc/shared-session-store` and adapt to SessionApi |

Remotes include thin adapters so feature code always programs against `SessionApi`.

## 8. Session coordinator behavior

Internal: Zustand vanilla store inside `session-coordinator`.

Simulated flows: login, logout, switch between two fictional accounts.

Transition sequence:

1. Enter `transitioning`; gate protected views/operations.
2. Advance `contextRevision`.
3. `prepareTransition` on active remotes (parallel); isolate obsolete activity.
4. `resetIdentityState` on remotes; reset remote-owned caches.
5. Confirm new simulated authoritative context with mock-api.
6. Publish new session snapshot; `resume` eligible remotes.

If cleanup fails for a remote: fail closed — do not resume with old data; block or unmount that remote. No unhandled rejections or hanging transitions.

Production SSR would require request-scoped session state — documented as out of scope.

## 9. Mock backend

Deterministic fictional data: two users, two accounts.

Provide:

- Session/context simulation endpoints.
- REST for TanStack Query remote.
- Minimal GraphQL for Apollo remote.
- Deterministic delay and failure controls.
- Delayed mutation scenario.
- Server-side request-scope enforcement (session cookie / mock token header mapped to account; reject cross-account access).

Never use real credentials or production services.

## 10. Remotes

### React + TanStack Query

- Own QueryClient lifecycle (create on mount, clear/dispose on reset/unmount).
- Account/context-aware query keys (`accountId`, `contextRevision`).
- Consume `AbortSignal` where supported; ignore obsolete responses.
- Small local feature state resets on identity reset.
- `useSyncExternalStore` (or equivalent) against injected/adapted SessionApi.

### Vue + Apollo Client core

- Own ApolloClient lifecycle.
- Strategy: **recreate ApolloClient per context revision** on identity reset (document why `clearStore`/`resetStore` alone is insufficient for in-flight safety).
- Framework-neutral Apollo core; Vue adapter for SessionApi.
- Handle old-context results safely (drop if revision mismatch).

### Domain invalidation hint (in scope)

- Mutation succeeds on mock-api.
- Emit minimal versioned notification (invalidation hint, not authoritative record).
- Interested remote refreshes its own data.
- Late-mounted remote must fetch current data (hints are not a cache).
- Transitions do not wait for in-flight mutations; mutations may complete under original context; never auto-retry under new account.

## 11. Visible POC UI

Each shell shows:

- DI mode label (A/B/C)
- Session status, fictional user/account, context revision
- Remote mount/unmount controls
- Login / logout / account switch
- Delayed-request and cleanup-failure scenario controls
- Bounded event/debug log
- Blocked / error / fallback states

All data labeled fictional. No credentials in logs.

## 12. Testing

### Unit (`session-coordinator`, contracts)

- Stable snapshot identity
- Subscribe / unsubscribe
- Exactly one coordinator instance per shell factory
- Transition sequencing
- Competing commands / supersession
- Failure and timeout behavior
- Revision-based rejection of obsolete callbacks

### Playwright

Full matrix on **shell-injected (A)**:

1. Cold start / successful initialization
2. Both remotes show same session context
3. Late-mounted remote reads current context
4. Account A slow response after switch to B → no A data under B
5. Logout then login as other user → no previous-user data
6. Unmount/remount → no duplicate subscriptions/notifications
7. Cleanup failure → affected remote blocked or unmounted
8. Mutation completes during transition → matches documented policy
9. Transition failure → recoverable safe UI state

Smoke on **B and C**: same context across remotes + late mount.

Deterministic mock-api controls (not arbitrary sleeps). Application-owned page objects. Shared test-support for fixtures/controls/diagnostics.

## 13. DI comparison (decision record content)

| Option | Description | POC role |
| --- | --- | --- |
| A Shell-injected SessionApi | Mount receives API | **Baseline / primary** — explicit ownership, framework-neutral, testable |
| B Federated accessor | Remote imports host-exported getter | Implemented for comparison — still shell-owned, weaker explicit DI |
| C Shared Zustand package | Package singleton store | Implemented as cautionary demo — couples remotes to store + instance identity hazards |
| D Events-only | Pub/sub without snapshot API | Document only — harder late-mount correctness |

Why A is baseline: explicit dependency at mount, no shared mutable package identity, remotes stay free of shell/Zustand types, easiest to reason about for cleanup and testing.

## 14. CI and DX

- `pnpm install`
- `pnpm dev:poc` → mock-api + remotes + shell-injected (document ports for B/C)
- `pnpm test:unit`, `pnpm typecheck`, `pnpm build`, `pnpm test:e2e`
- GitHub Actions for install, typecheck, unit, build, e2e (with health/readiness gates)
- Documented ports and env; no external credentials

## 15. Documentation deliverables

- `README.md` — setup, scenarios, what is simulated
- `docs/architecture.md` — ownership, mount contract, transition sequence, TanStack/Apollo decisions, same-realm security limits, SSR/native excluded
- `docs/decisions/001-session-di.md` — A/B/C/D comparison
- `docs/measurement-plan.md` — proposed metrics; no invented ROI
- `docs/limitations.md` — adapters and security work still required
- `AGENTS.md` — ownership, lifecycle rules, cache responsibilities, commands, testing expectations, no raw credentials / unrestricted store mutation, how to add a remote

## 16. Scope exclusions

Not implemented: production IdP, real token refresh, native/WebView, cross-origin iframe messaging, cross-tab sync, production SSR, org-wide migration tooling, full design system.

## 17. Completion criteria

Repository starts locally with documented commands; loads both remotes through MF; uses framework-neutral session capability; demonstrates safe transitions; includes executable tests with honest results; explains limitations and next pilot step.

No GitHub remote create/push, publish, or external deploy without explicit authorization.

## 18. Suggested next pilot step (post-POC)

Adopt Approach A in one production shell with a single remote; add real auth adapter behind SessionApi; keep remotes on injected contract; measure transition latency and cleanup failure rate from the measurement plan.
