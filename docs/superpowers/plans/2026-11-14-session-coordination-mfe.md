# Session Coordination MFE Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a runnable pnpm monorepo where three Modern.js shells (injected / federated / shared-Zustand DI) coordinate session lifecycle into Rsbuild Module Federation remotes (React+TanStack Query, Vue+Apollo) against a fictional mock-api, with unit + Playwright proof.

**Architecture:** Shell-owned `SessionCoordinator` (Zustand vanilla) publishes a framework-neutral `SessionApi`. Remotes mount via MF `mount(el, caps)`, own their query clients, and implement `RemoteLifecycle` for prepare/reset/resume/block/dispose. Approach A injects the API; B exposes `getSessionApi` as a federated module; C demonstrates a shared Zustand package anti-pattern. Full E2E on A; smoke on B/C.

**Tech Stack:** Modern.js 3.11.3, `@module-federation/modern-js-v3` 2.9.3, Rsbuild 2.3.2 + `@module-federation/rsbuild-plugin` 2.9.3, React 19.3.1, Vue 3.5.45, Zustand 5.1.0, TanStack Query 5.107.1, Apollo Client 4.3.8, Vitest 5.1.0, Playwright 1.65.1, TypeScript 5.x, pnpm 10.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-11-14-session-coordination-mfe-design.md`
- CSR only; no production IdP/tokens; fictional data only; never log credentials
- Public contract has zero dependency on Modern.js / React / Zustand
- Exactly one coordinator per browser shell instance
- Fail closed on remote cleanup failure; single-flight transitions; superseded commands reject
- In-flight mutations may complete under old revision; never auto-retry under new account
- Do not replace Modern.js; re-verify plugin APIs against installed package docs if config fails
- Node >= 22.18 recommended; pnpm 10; commit the lockfile
- No GitHub create/push/deploy without explicit authorization

## File map (create)

```
package.json
pnpm-workspace.yaml
tsconfig.base.json
.nvmrc
.gitignore
AGENTS.md
README.md
.github/workflows/ci.yml
apps/mock-api/**                     # Express REST+GraphQL + control plane
apps/remote-react/**                 # Rsbuild MF remote
apps/remote-vue/**                   # Rsbuild MF remote
apps/shell-injected/**               # Modern.js DI A
apps/shell-federated/**              # Modern.js DI B
apps/shell-zustand/**                # Modern.js DI C
packages/platform-contracts/**       # SessionApi types + validators + errors
packages/session-coordinator/**      # createSessionCoordinator
packages/shared-session-store/**     # DI C singleton
packages/shell-ui/**                 # shared debug UI (implementation convenience)
packages/test-support/**             # fixtures + mock controls helpers
tests/e2e/**                         # Playwright
docs/architecture.md
docs/decisions/001-session-di.md
docs/measurement-plan.md
docs/limitations.md
```

`packages/shell-ui` is an allowed structure adjustment so three shells do not triplicate the debug UI.

---

### Task 1: Workspace scaffold + contracts package (TDD)

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.nvmrc`, `.gitignore` (extend)
- Create: `packages/platform-contracts/package.json`
- Create: `packages/platform-contracts/tsconfig.json`
- Create: `packages/platform-contracts/src/index.ts`
- Create: `packages/platform-contracts/src/session.ts`
- Create: `packages/platform-contracts/src/lifecycle.ts`
- Create: `packages/platform-contracts/src/errors.ts`
- Create: `packages/platform-contracts/src/validate.ts`
- Create: `packages/platform-contracts/src/domain-hint.ts`
- Create: `packages/platform-contracts/src/session.test.ts`
- Create: `packages/platform-contracts/vitest.config.ts`

**Interfaces:**
- Produces: `SessionSnapshot`, `SessionApi`, `RemoteLifecycle`, `TransitionContext`, `MountHandle`, `SessionCommandError`, `assertAccountId`, `DomainInvalidationHint`

- [ ] **Step 1: Write root workspace files**

`package.json`:
```json
{
  "name": "mfe-federation-poc",
  "private": true,
  "packageManager": "pnpm@10.33.2",
  "scripts": {
    "dev:poc": "pnpm --parallel --filter @poc/mock-api --filter @poc/remote-react --filter @poc/remote-vue --filter @poc/shell-injected dev",
    "dev:a": "pnpm --filter @poc/shell-injected dev",
    "dev:b": "pnpm --filter @poc/shell-federated dev",
    "dev:c": "pnpm --filter @poc/shell-zustand dev",
    "typecheck": "pnpm -r --if-present typecheck",
    "test:unit": "pnpm -r --if-present test",
    "build": "pnpm -r --if-present build",
    "test:e2e": "pnpm --filter @poc/e2e test",
    "ci": "pnpm typecheck && pnpm test:unit && pnpm build"
  },
  "engines": { "node": ">=22.18.0" }
}
```

`pnpm-workspace.yaml`:
```yaml
packages:
  - "apps/*"
  - "packages/*"
  - "tests/*"
```

`.nvmrc`:
```
22
```

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

- [ ] **Step 2: Write failing contract tests**

`packages/platform-contracts/package.json`:
```json
{
  "name": "@poc/platform-contracts",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "devDependencies": {
    "typescript": "5.9.3",
    "vitest": "5.1.0"
  }
}
```

`packages/platform-contracts/src/session.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { assertAccountId, SESSION_CONTRACT_VERSION } from "./index";

describe("platform-contracts", () => {
  it("exposes contractVersion 1 constant", () => {
    expect(SESSION_CONTRACT_VERSION).toBe(1);
  });

  it("accepts known fictional account ids", () => {
    expect(assertAccountId("acct_north")).toBe("acct_north");
    expect(assertAccountId("acct_south")).toBe("acct_south");
  });

  it("rejects unknown account ids", () => {
    expect(() => assertAccountId("acct_evil")).toThrow(/accountId/);
  });
});
```

- [ ] **Step 3: Run test — expect fail**

Run: `pnpm install && pnpm --filter @poc/platform-contracts test`  
Expected: FAIL (module not found / exports missing)

- [ ] **Step 4: Implement contracts**

`packages/platform-contracts/src/session.ts`:
```ts
export const SESSION_CONTRACT_VERSION = 1 as const;

export type SessionStatus =
  | "initializing"
  | "authenticated"
  | "anonymous"
  | "transitioning"
  | "error";

export type SessionSnapshot = {
  status: SessionStatus;
  subjectId?: string;
  accountId?: string;
  contextRevision: number;
};

export interface SessionApi {
  readonly contractVersion: typeof SESSION_CONTRACT_VERSION;
  getSnapshot(): Readonly<SessionSnapshot>;
  subscribe(onChange: () => void): () => void;
  requestLogin(): Promise<void>;
  requestLogout(): Promise<void>;
  requestAccountChange(accountId: string): Promise<void>;
}
```

`packages/platform-contracts/src/lifecycle.ts`:
```ts
import type { SessionSnapshot } from "./session";

export type TransitionContext = {
  fromRevision: number;
  toRevision: number;
  signal: AbortSignal;
};

export type RemoteBlockReason =
  | { type: "cleanup_failed"; message: string }
  | { type: "timeout"; message: string }
  | { type: "transition_failed"; message: string };

export interface RemoteLifecycle {
  prepareTransition(ctx: TransitionContext): Promise<void>;
  resetIdentityState(ctx: TransitionContext): Promise<void>;
  resume(ctx: TransitionContext): Promise<void>;
  block(reason: RemoteBlockReason): void;
  dispose(): void;
}

export interface MountHandle {
  lifecycle: RemoteLifecycle;
  unmount(): void;
}

export type MountCapabilities = {
  session?: import("./session").SessionApi;
  /** Optional diagnostics sink from shell */
  onEvent?: (event: { type: string; detail?: unknown }) => void;
};

export type RemoteMount = (
  element: HTMLElement,
  capabilities: MountCapabilities,
) => MountHandle;
```

`packages/platform-contracts/src/errors.ts`:
```ts
export type SessionErrorCode =
  | "INVALID_ACCOUNT"
  | "TRANSITION_SUPERSEDED"
  | "TRANSITION_TIMEOUT"
  | "TRANSITION_FAILED"
  | "REMOTE_CLEANUP_FAILED";

export class SessionCommandError extends Error {
  readonly code: SessionErrorCode;
  constructor(code: SessionErrorCode, message: string) {
    super(message);
    this.name = "SessionCommandError";
    this.code = code;
  }
}
```

`packages/platform-contracts/src/validate.ts`:
```ts
import { SessionCommandError } from "./errors";

export const FICTIONAL_ACCOUNT_IDS = ["acct_north", "acct_south"] as const;
export type FictionalAccountId = (typeof FICTIONAL_ACCOUNT_IDS)[number];

export function assertAccountId(accountId: string): FictionalAccountId {
  if ((FICTIONAL_ACCOUNT_IDS as readonly string[]).includes(accountId)) {
    return accountId as FictionalAccountId;
  }
  throw new SessionCommandError(
    "INVALID_ACCOUNT",
    `Unknown accountId: ${accountId}`,
  );
}
```

`packages/platform-contracts/src/domain-hint.ts`:
```ts
export type DomainInvalidationHint = {
  kind: "orders";
  accountId: string;
  version: number;
  contextRevision: number;
};
```

`packages/platform-contracts/src/index.ts`:
```ts
export * from "./session";
export * from "./lifecycle";
export * from "./errors";
export * from "./validate";
export * from "./domain-hint";
```

Also add `tsconfig.json` extending base, `vitest.config.ts` with `environment: "node"`.

- [ ] **Step 5: Run tests — expect pass**

Run: `pnpm --filter @poc/platform-contracts test`  
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json .nvmrc .gitignore packages/platform-contracts pnpm-lock.yaml
git commit -m "chore: scaffold workspace and platform-contracts"
```

---

### Task 2: Session coordinator (TDD)

**Files:**
- Create: `packages/session-coordinator/package.json`
- Create: `packages/session-coordinator/tsconfig.json`
- Create: `packages/session-coordinator/vitest.config.ts`
- Create: `packages/session-coordinator/src/index.ts`
- Create: `packages/session-coordinator/src/createSessionCoordinator.ts`
- Create: `packages/session-coordinator/src/remoteRegistry.ts`
- Create: `packages/session-coordinator/src/types.ts`
- Create: `packages/session-coordinator/src/createSessionCoordinator.test.ts`

**Interfaces:**
- Consumes: `@poc/platform-contracts` SessionApi, RemoteLifecycle, TransitionContext, SessionCommandError, assertAccountId
- Produces: `createSessionCoordinator(options) => { api: SessionApi; registry: RemoteRegistry; dispose(): void }`

- [ ] **Step 1: Write failing tests** covering:
  - stable snapshot identity until change
  - subscribe/unsubscribe
  - one coordinator instance per `createSessionCoordinator` call (two creates → two instances)
  - transition sequencing: status path `anonymous → transitioning → authenticated` with revision bump before resume
  - competing `requestAccountChange` → first rejects `TRANSITION_SUPERSEDED`
  - prepare timeout → remote `block`, transition still completes or fails closed per options
  - obsolete callback: listener that checks revision ignores stale work (test via fake remote)
  - cleanup failure → remote blocked, not resumed

Test file outline (implement fully in repo):
```ts
import { describe, expect, it, vi } from "vitest";
import { createSessionCoordinator } from "./createSessionCoordinator";
import type { RemoteLifecycle } from "@poc/platform-contracts";

function fakeRemote(overrides: Partial<RemoteLifecycle> = {}): RemoteLifecycle {
  return {
    prepareTransition: vi.fn(async () => {}),
    resetIdentityState: vi.fn(async () => {}),
    resume: vi.fn(async () => {}),
    block: vi.fn(),
    dispose: vi.fn(),
    ...overrides,
  };
}

describe("createSessionCoordinator", () => {
  it("keeps snapshot reference stable until change", () => {
    const c = createSessionCoordinator({
      auth: {
        login: async () => ({ subjectId: "user_ava", accountId: "acct_north" }),
        logout: async () => {},
        changeAccount: async (accountId) => ({ subjectId: "user_ava", accountId }),
      },
    });
    const a = c.api.getSnapshot();
    const b = c.api.getSnapshot();
    expect(a).toBe(b);
  });
  // ... remaining cases from list above
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm --filter @poc/session-coordinator test`  
Expected: FAIL

- [ ] **Step 3: Implement coordinator**

Key implementation rules in `createSessionCoordinator.ts`:

```ts
import { createStore } from "zustand/vanilla";
import {
  SESSION_CONTRACT_VERSION,
  SessionCommandError,
  assertAccountId,
  type SessionApi,
  type SessionSnapshot,
  type RemoteLifecycle,
  type TransitionContext,
} from "@poc/platform-contracts";

export type AuthBridge = {
  login(): Promise<{ subjectId: string; accountId: string }>;
  logout(): Promise<void>;
  changeAccount(accountId: string): Promise<{ subjectId: string; accountId: string }>;
};

export type CoordinatorOptions = {
  auth: AuthBridge;
  transitionTimeoutMs?: number; // default 3000
};

type InternalState = {
  snapshot: SessionSnapshot;
};

export function createSessionCoordinator(options: CoordinatorOptions) {
  const transitionTimeoutMs = options.transitionTimeoutMs ?? 3000;
  const store = createStore<InternalState>(() => ({
    snapshot: { status: "initializing", contextRevision: 0 },
  }));

  let snapshotRef = store.getState().snapshot;
  const listeners = new Set<() => void>();
  const remotes = new Map<string, RemoteLifecycle>();
  let generation = 0;
  let gate: Promise<void> | null = null;

  const publish = (next: SessionSnapshot) => {
    snapshotRef = Object.freeze({ ...next });
    store.setState({ snapshot: snapshotRef });
    listeners.forEach((l) => l());
  };

  // After init tick → anonymous
  queueMicrotask(() => {
    if (snapshotRef.status === "initializing") {
      publish({ status: "anonymous", contextRevision: snapshotRef.contextRevision });
    }
  });

  const withTransition = async (run: (ctx: TransitionContext, gen: number) => Promise<SessionSnapshot>) => {
    const myGen = ++generation;
    const previous = gate ?? Promise.resolve();
    let release!: () => void;
    gate = new Promise<void>((r) => { release = r; });
    await previous.catch(() => {});
    if (myGen !== generation) {
      release();
      throw new SessionCommandError("TRANSITION_SUPERSEDED", "Superseded by a newer session command");
    }

    const fromRevision = snapshotRef.contextRevision;
    const toRevision = fromRevision + 1;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), transitionTimeoutMs);
    publish({ ...snapshotRef, status: "transitioning", contextRevision: toRevision });
    const ctx: TransitionContext = { fromRevision, toRevision, signal: ac.signal };

    try {
      await mapRemotes(async (remote) => {
        await remote.prepareTransition(ctx);
      });
      await mapRemotes(async (remote) => {
        try {
          await remote.resetIdentityState(ctx);
        } catch (e) {
          remote.block({ type: "cleanup_failed", message: String(e) });
          throw e;
        }
      });
      const next = await run(ctx, myGen);
      if (myGen !== generation) {
        throw new SessionCommandError("TRANSITION_SUPERSEDED", "Superseded");
      }
      publish(next);
      await mapRemotes(async (remote) => {
        // skip blocked remotes — tracked separately
        await remote.resume(ctx);
      });
    } catch (e) {
      if (e instanceof SessionCommandError && e.code === "TRANSITION_SUPERSEDED") throw e;
      publish({
        status: "error",
        contextRevision: toRevision,
        subjectId: undefined,
        accountId: undefined,
      });
      throw e instanceof SessionCommandError
        ? e
        : new SessionCommandError("TRANSITION_FAILED", String(e));
    } finally {
      clearTimeout(timer);
      release();
      if (gate && myGen === generation) gate = null;
    }
  };

  async function mapRemotes(fn: (r: RemoteLifecycle) => Promise<void>) {
    const entries = [...remotes.entries()];
    const results = await Promise.allSettled(entries.map(([, r]) => fn(r)));
    // fail-closed handling for cleanup implemented in caller / registry flags
    const rejected = results.find((r) => r.status === "rejected");
    if (rejected && rejected.status === "rejected") throw rejected.reason;
  }

  const api: SessionApi = {
    contractVersion: SESSION_CONTRACT_VERSION,
    getSnapshot: () => snapshotRef,
    subscribe: (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    requestLogin: () =>
      withTransition(async () => {
        const identity = await options.auth.login();
        return {
          status: "authenticated",
          subjectId: identity.subjectId,
          accountId: identity.accountId,
          contextRevision: snapshotRef.contextRevision,
        };
      }),
    requestLogout: () =>
      withTransition(async () => {
        await options.auth.logout();
        return { status: "anonymous", contextRevision: snapshotRef.contextRevision };
      }),
    requestAccountChange: (accountId) =>
      withTransition(async () => {
        const id = assertAccountId(accountId);
        const identity = await options.auth.changeAccount(id);
        return {
          status: "authenticated",
          subjectId: identity.subjectId,
          accountId: identity.accountId,
          contextRevision: snapshotRef.contextRevision,
        };
      }),
  };

  return {
    api,
    registry: {
      register(id: string, lifecycle: RemoteLifecycle) {
        remotes.set(id, lifecycle);
      },
      unregister(id: string) {
        remotes.delete(id);
      },
    },
    dispose() {
      listeners.clear();
      remotes.clear();
    },
  };
}
```

Refine blocked-remote tracking so failed cleanup remotes are not resumed (use a `Set<string> blocked` in the real implementation; tests must assert `resume` not called after `block`).

Dependencies: `zustand@5.1.0`, `@poc/platform-contracts`, vitest, typescript.

- [ ] **Step 4: Run tests — PASS**

Run: `pnpm --filter @poc/session-coordinator test`

- [ ] **Step 5: Commit**

```bash
git add packages/session-coordinator pnpm-lock.yaml
git commit -m "feat: add session-coordinator with transition protocol"
```

---

### Task 3: shared-session-store (DI C) + test-support fixtures

**Files:**
- Create: `packages/shared-session-store/**`
- Create: `packages/test-support/**`

**Interfaces:**
- Produces: `getSharedSessionStore()`, `asSessionApi(store)` for C
- Produces: fictional user fixtures, mock-api control client helpers

- [ ] **Step 1: Implement shared store package** that creates one module-level coordinator adapted to SessionApi (document anti-pattern in package README comment).

- [ ] **Step 2: Implement test-support** with:
  - `FICTIONAL_USERS`, `FICTIONAL_ACCOUNTS`
  - `MockApiControls` HTTP client pointing at `http://127.0.0.1:4010/__controls/*`

- [ ] **Step 3: Unit smoke test** that two imports of `getSharedSessionStore()` return the same reference.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: add shared-session-store and test-support fixtures"
```

---

### Task 4: mock-api

**Files:**
- Create: `apps/mock-api/package.json`
- Create: `apps/mock-api/src/index.ts`
- Create: `apps/mock-api/src/data.ts`
- Create: `apps/mock-api/src/rest.ts`
- Create: `apps/mock-api/src/graphql.ts`
- Create: `apps/mock-api/src/controls.ts`
- Create: `apps/mock-api/src/session.ts`

**Interfaces:**
- Port `4010`
- Headers: `x-poc-session: <subjectId>` + `x-poc-account: <accountId>` required for data routes; mismatch → 403
- REST: `GET /api/orders`, `POST /api/orders/:id/note` (delayed mutation)
- GraphQL: `{ accountSummary { id name openOrders } }`
- Controls: `POST /__controls/delay`, `POST /__controls/fail-next`, `POST /__controls/cleanup-fail`, `POST /__controls/reset`
- Session simulation: `POST /api/session/login`, `/logout`, `/account`

- [ ] **Step 1: Implement Express + `graphql` HTTP server** with deterministic data for `user_ava`/`user_beau` and `acct_north`/`acct_south`.

- [ ] **Step 2: Manual verify**

Run: `pnpm --filter @poc/mock-api dev`  
Then: `curl -s http://127.0.0.1:4010/health` → `{"ok":true}`

- [ ] **Step 3: Commit**

```bash
git commit -m "feat: add fictional mock-api with REST GraphQL and controls"
```

---

### Task 5: remote-react (Rsbuild MF)

**Files:**
- Create: `apps/remote-react/package.json`
- Create: `apps/remote-react/rsbuild.config.ts`
- Create: `apps/remote-react/module-federation.config.ts` (or inline in rsbuild)
- Create: `apps/remote-react/src/mount.tsx`
- Create: `apps/remote-react/src/App.tsx`
- Create: `apps/remote-react/src/sessionAdapter.ts`
- Create: `apps/remote-react/src/query.ts`
- Create: `apps/remote-react/src/bootstrap.tsx`

**Interfaces:**
- Exposes MF module `./mount` → `RemoteMount`
- Port `5001`
- Consumes SessionApi via `capabilities.session` (A) or optional global resolver hooks for B/C adapters passed from shell-ui wrappers

Capability resolution order in remote:
1. `capabilities.session` if provided
2. else `capabilities.resolveSession?.()` if provided (shells B/C pass this)

- [ ] **Step 1: Configure Rsbuild + `@module-federation/rsbuild-plugin`**

Expose: `./mount` → `src/mount.tsx`  
Shared: react, react-dom as singleton eager false where required by MF docs.

- [ ] **Step 2: Implement mount**

```tsx
export function mount(element: HTMLElement, capabilities: MountCapabilities): MountHandle {
  const session = resolveSession(capabilities);
  const queryClient = new QueryClient();
  let blocked: RemoteBlockReason | null = null;
  let localFeature = { draftNote: "" };
  let root = createRoot(element);
  const render = () => root.render(<App ... />);

  const unsub = session.subscribe(() => render());
  render();

  const lifecycle: RemoteLifecycle = {
    async prepareTransition(ctx) {
      queryClient.cancelQueries();
      // abort controllers for in-flight
    },
    async resetIdentityState(ctx) {
      if (capabilities.forceCleanupFail) throw new Error("forced cleanup failure");
      queryClient.clear();
      localFeature = { draftNote: "" };
    },
    async resume() { blocked = null; render(); },
    block(reason) { blocked = reason; render(); },
    dispose() { unsub(); queryClient.clear(); root.unmount(); },
  };

  return { lifecycle, unmount: () => lifecycle.dispose() };
}
```

Use query keys: `["orders", accountId, contextRevision]`. Pass `signal` from query. Drop results if snapshot revision changed.

- [ ] **Step 3: Dev server health**

Run remote alone; open `http://127.0.0.1:5001/mf-manifest.json` (or path from plugin docs) — must 200.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: add React TanStack Query federated remote"
```

---

### Task 6: remote-vue (Rsbuild MF + Apollo)

**Files:**
- Create: `apps/remote-vue/**` analogous to React remote
- Port `5002`
- Expose `./mount`

**Interfaces:**
- Apollo Client **recreated** in `resetIdentityState` (new cache instance bound to new revision)
- Document in remote README comment why clearStore alone is insufficient

- [ ] **Step 1–4:** Mirror Task 5 with Vue 3 `createApp`, Apollo Client core `HttpLink`/`InMemoryCache`, GraphQL query to mock-api. Same lifecycle semantics. Commit:

```bash
git commit -m "feat: add Vue Apollo federated remote"
```

---

### Task 7: shell-ui package + shell-injected (DI A)

**Files:**
- Create: `packages/shell-ui/**` — SessionPanel, RemoteHost, EventLog, ScenarioControls
- Create: `apps/shell-injected/**` — Modern.js app, `module-federation.config.ts`, coordinator wiring

**Interfaces:**
- Port `8080`
- Remotes:
  - `reactRemote@http://localhost:5001/mf-manifest.json`
  - `vueRemote@http://localhost:5002/mf-manifest.json`
- On mount: `import("reactRemote/mount")` then `mount(el, { session: api, onEvent })` and `registry.register`

- [ ] **Step 1: Scaffold Modern.js app** using `@modern-js/create` in a temp dir if needed, then move files into `apps/shell-injected`, OR hand-write `package.json` with `@modern-js/app-tools@3.11.3`, `@modern-js/runtime@3.11.3`, `@module-federation/modern-js-v3@2.9.3`.

`modern.config.ts`:
```ts
import { appTools, defineConfig } from "@modern-js/app-tools";
import { moduleFederationPlugin } from "@module-federation/modern-js-v3";

export default defineConfig({
  server: { port: 8080 },
  // CSR: do not enable ssr
  plugins: [appTools(), moduleFederationPlugin()],
});
```

`module-federation.config.ts`:
```ts
import { createModuleFederationConfig } from "@module-federation/modern-js-v3";

export default createModuleFederationConfig({
  name: "shell_injected",
  remotes: {
    reactRemote: "reactRemote@http://localhost:5001/mf-manifest.json",
    vueRemote: "vueRemote@http://localhost:5002/mf-manifest.json",
  },
  shared: {
    react: { singleton: true },
    "react-dom": { singleton: true },
  },
});
```

- [ ] **Step 2: Wire coordinator auth bridge** to mock-api session endpoints.

- [ ] **Step 3: Run `pnpm dev:poc`** and verify both remotes mount and show same revision after login.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: add shell-injected Modern.js host (DI A)"
```

---

### Task 8: shell-federated (DI B) + shell-zustand (DI C)

**Files:**
- Create: `apps/shell-federated/**` port `8081`
- Create: `apps/shell-zustand/**` port `8082`

**B specifics:**
- Expose federated module `./session` → `{ getSessionApi }`
- Remotes receive `capabilities.resolveSession = () => getSessionApi()` OR remotes import `shellSession/session` — prefer explicit `resolveSession` passed at mount from host to avoid remote hardcoding host name; also expose module for the comparison documented in decisions.
- Document both: mount still called by shell; accessor demonstrates federated retrieval.

**C specifics:**
- Import `@poc/shared-session-store`; pass adapted SessionApi into mount
- Show banner: “DI C anti-pattern: shared Zustand package”

- [ ] **Step 1: Implement both shells sharing `shell-ui`**

- [ ] **Step 2: Smoke manually** — login on B and C; remotes show context

- [ ] **Step 3: Commit**

```bash
git commit -m "feat: add shell-federated and shell-zustand DI comparison hosts"
```

---

### Task 9: Playwright E2E + CI + docs

**Files:**
- Create: `tests/e2e/package.json`, `playwright.config.ts`, `page-objects/*`, specs for A scenarios 1–9, B/C smoke
- Create: `.github/workflows/ci.yml`
- Create: `README.md`, `AGENTS.md`, `docs/architecture.md`, `docs/decisions/001-session-di.md`, `docs/measurement-plan.md`, `docs/limitations.md`

- [ ] **Step 1: Page objects** for shell session controls, remote panels, mock controls

- [ ] **Step 2: Write A specs** using mock-api `__controls` for delay/fail (no arbitrary sleeps beyond Playwright auto-wait)

- [ ] **Step 3: Health gates** in playwright `globalSetup`: wait for `:4010/health`, remotes manifests, `:8080`

- [ ] **Step 4: Run e2e**

Run: `pnpm dev:poc` (background) then `pnpm test:e2e`  
Record honest results in README “Test results” section (pass/fail counts). If environment cannot run browsers, state that explicitly.

- [ ] **Step 5: Write docs** per spec sections 13–16

- [ ] **Step 6: Commit**

```bash
git commit -m "test: add Playwright suite, CI, and POC documentation"
```

---

## Self-review (plan vs spec)

| Spec requirement | Task |
| --- | --- |
| platform-contracts SessionApi | Task 1 |
| lifecycle protocol + coordinator | Task 2 |
| DI C shared zustand | Task 3, 8 |
| mock-api REST/GraphQL/controls/scope | Task 4 |
| React TanStack remote | Task 5 |
| Vue Apollo remote + per-context client | Task 6 |
| Shell injected A | Task 7 |
| Shells B and C | Task 8 |
| Unit + Playwright + CI + docs | Task 2, 9 |
| Measurement/limitations/ADR | Task 9 |
| Mutation-during-transition policy | Tasks 2, 5, 9 scenario 8 |
| Three Modern.js shells | Tasks 7–8 |

No TBD placeholders. Types aligned on `SessionApi`, `RemoteLifecycle`, `MountHandle`, `contextRevision`.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-11-14-session-coordination-mfe.md`.

Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks
2. **Inline Execution** — execute tasks in this session with checkpoints

Which approach?
