# Event Channel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a shell-brokered event channel (shell→remote, remote→shell, remote→remote) with a signals adapter, delivered as a new shell D (`apps/shell-events`, port 8093) and a new remote (`apps/remote-events`, port 5003).

**Architecture:** `@poc/platform-contracts` gets a plain-function `EventsApi`. A shell-internal `@poc/event-broker` implements it per remote facade (sender set by the broker, namespace-enforced, revision-aware, revoked with the facade). A remote-side `@poc/events-signals` package turns topics into `@preact/signals-core` signals and a React hook; each remote bundles its own copy. `@poc/shell-ui` gains optional events wiring so shells A/B/C are unchanged.

**Tech Stack:** TypeScript, vitest 5.1.0, zustand not needed, `@preact/signals-core`, Modern.js (shell), rsbuild + Module Federation (remotes), Playwright, Tailwind 4.3.5.

**Spec:** `docs/superpowers/specs/2026-11-18-event-channel-design.md`

## Global Constraints

- `@poc/platform-contracts` is types + small validators only: no store instances, no library dependency.
- `@poc/event-broker` is shell-internal: remotes must not import it (same rule as `@poc/session-coordinator` and `@poc/shell-state`). Remotes depend only on `@poc/platform-contracts`, `@poc/events-signals`, and the design-system packages.
- `MountCapabilities.events` is optional; a remote must mount and work when it is absent.
- Match cross-bundle errors by `error.name === "EventsCommandError"` and `error.code`, never `instanceof` (`@poc/platform-contracts` is not shared through Module Federation).
- Remotes catch only `FACADE_REVOKED` from events commands. Never call events commands in `block`/`dispose`; release subscriptions via the returned functions only.
- Topic grammar `^[a-z][a-z0-9-]*(\.[a-z0-9-]+)+$`; first segment is the owner namespace. Remotes publish/`setState` only on their own id namespace (`events.*` for remote id `events`); `shell.*` only the shell. Anyone may `on`/`state` any topic.
- Payload: structured-cloned and frozen on publish, max 4 KB, else `PAYLOAD_TOO_LARGE`.
- Delivery: synchronous, per-subscriber try/catch isolated, re-entrancy safe (publishes from a handler are queued after the current delivery). Events have no replay; `state()` returns the retained value immediately.
- Transition: broker mirrors the session's `contextRevision`; on `transitioning` it clears all retained state outside `shell.*`, drops queued events, and silently drops remote `publish`/`setState` (no new error code). Remotes republish in `resume()`.
- Existing shells A/B/C and their 9 Playwright scenarios stay unchanged and green.
- Design system rules: semantic tokens only, no colour values, no preflight, no token declarations in remote CSS (`AGENTS.md`). Rendered text goes in as text, never HTML. All data fictional.
- Pinned versions: Tailwind and `@tailwindcss/postcss` `4.3.5`, vitest `5.1.0`, typescript `5.9.3`, `@module-federation/rsbuild-plugin` `2.9.3`, `@module-federation/modern-js-v3` `2.9.3`, `@modern-js/app-tools` and `@modern-js/runtime` `3.11.3`. Pin `@preact/signals-core` to one exact version across the workspace.

## Review Focus

- A handler that throws must not stop other subscribers or the publisher (Task 2).
- A publish from inside a handler must not recurse or reorder the current delivery (Task 2).
- A non-structured-cloneable payload (function, circular) throws `INVALID_PAYLOAD` instead of a raw `DataCloneError` (Task 1 validator, Task 2). This code is added beyond the spec's four; flagged as a builder call.
- Remount of the same remote id gets a fresh facade; the old facade's subscriptions never fire and never leak (Task 3).
- `shell.notice` published by the shell while `transitioning` is dropped; `state()` read during a transition returns cleared remote topics (Task 3).
- After an account switch no remote sees the old account's `events.counter` or `react.ack` (Task 9, end-to-end).

---

### Task 1: Events contract, errors and validators

**Files:**
- Create: `packages/platform-contracts/src/events.ts`, `packages/platform-contracts/src/events.test.ts`
- Modify: `packages/platform-contracts/src/index.ts`, `packages/platform-contracts/src/lifecycle.ts` (add `events?: EventsApi` to `MountCapabilities`)

**Interfaces:**
- Produces (exact, from the spec): `EVENTS_CONTRACT_VERSION = 1 as const`, `EventMessage<T = unknown>` (`topic`, `payload`, `from`, `contextRevision`, `seq`), `TopicState<T>` (`get()`, `subscribe(onChange)`), `EventsApi` (`contractVersion`, `publish`, `on`, `setState`, `state<T>`), `EventsErrorCode = "INVALID_TOPIC" | "NOT_OWNER" | "INVALID_PAYLOAD" | "PAYLOAD_TOO_LARGE" | "FACADE_REVOKED"`, `class EventsCommandError extends Error` (`name = "EventsCommandError"`, `readonly code`), `MAX_PAYLOAD_BYTES = 4096`.
- Produces validators: `assertTopic(topic: string): string` (throws `INVALID_TOPIC`), `topicOwner(topic: string): string` (first segment), `freezePayload(payload: unknown): unknown` (structured clone, deep freeze; throws `INVALID_PAYLOAD` on `DataCloneError`, `PAYLOAD_TOO_LARGE` over `MAX_PAYLOAD_BYTES` measured on `JSON.stringify` UTF-8 byte length).

- [ ] **Step 1: Write failing tests in `events.test.ts`:** `assertTopic` accepts `shell.path`, `events.counter`, `a-b.c-d.e`; rejects `Shell.path`, `shell`, `shell.`, `.x`, `__proto__.x`, `a..b`, `1a.b`. `topicOwner("events.counter") === "events"`. `freezePayload({a:[1]})` returns a deep-frozen copy not identical to the input; a function payload and a circular object throw `EventsCommandError` with code `INVALID_PAYLOAD`; a 4097-byte string payload throws `PAYLOAD_TOO_LARGE`; a payload of exactly 4096 serialized bytes passes. `new EventsCommandError("NOT_OWNER","x").name === "EventsCommandError"`.
- [ ] **Step 2: Run** `pnpm --filter @poc/platform-contracts test` — expect FAIL (module missing).
- [ ] **Step 3: Implement** `events.ts` per Interfaces (mirror `ShellCommandError` in `shell.ts`); export from `index.ts`; add `events?: EventsApi` to `MountCapabilities`.
- [ ] **Step 4: Run** `pnpm --filter @poc/platform-contracts test` and `pnpm typecheck` — expect PASS.
- [ ] **Step 5: Commit** `feat(platform-contracts): events contract, errors and validators`.

### Task 2: Event broker core (events, retained state, namespaces, delivery)

**Files:**
- Create: `packages/event-broker/{package.json,tsconfig.json,src/index.ts,src/createEventBroker.ts,src/createEventBroker.test.ts}` (copy `package.json`/`tsconfig.json` shape from `packages/shell-state`, no zustand; depend on `@poc/platform-contracts`)

**Interfaces:**
- Consumes: Task 1 contract, `SessionApi` from `@poc/platform-contracts`.
- Produces:
  ```ts
  export type BrokerMessage = EventMessage & { kind: "event" | "state" };
  export interface EventBroker {
    forRemote(remoteId: string): EventsApi;            // revokes any previous facade for this id
    unregisterRemote(remoteId: string): void;          // revoke: drop subs, clear its retained topics
    publishFromShell(topic: string, payload: unknown): void;   // topic must be shell.*
    setShellState(topic: string, value: unknown): void;        // retained, shell.* only
    observe(onMessage: (m: BrokerMessage) => void): () => void; // sees every accepted event/state change, for the event log
    dispose(): void;
  }
  export function createEventBroker(options: { session: SessionApi }): EventBroker;
  ```
  (`registerRemote` lifecycle wrapper and transition handling arrive in Task 3; this task reads `session.getSnapshot().contextRevision` at publish time only.)

- [ ] **Step 1: Write failing tests** (`createEventBroker.test.ts`, fake `SessionApi` from `@poc/test-support` if one exists, else a 10-line stub): remote `events` can `publish("events.ping",…)` and a remote `react` `on("events.ping")` receives `{topic, payload, from:"events", contextRevision, seq}` with `from` set by the broker (payload cannot spoof it) and `seq` strictly increasing; `events` publishing `react.x` or `shell.x` throws `NOT_OWNER`; bad topic throws `INVALID_TOPIC`; `setState("events.counter",1)` then another remote's `state("events.counter").get()` is `1` with stable identity until the value changes, and `subscribe` fires only on change of that topic; late subscriber to an event gets no replay; a throwing handler does not stop the next handler or the publisher; a handler that publishes inside delivery is delivered after the current message finishes, in order; `publishFromShell("shell.notice",…)` reaches remotes, `publishFromShell("events.x",…)` throws `NOT_OWNER`; after `unregisterRemote("events")` its subscriptions stop, its retained topics read `undefined`, and its old facade throws `FACADE_REVOKED` on every method; `observe` sees accepted events and state changes; payload mutation by the publisher after publish does not affect delivered payload.
- [ ] **Step 2: Run** `pnpm --filter @poc/event-broker test` — expect FAIL.
- [ ] **Step 3: Implement** `createEventBroker` in `createEventBroker.ts` with `Map`-based registries (no object-keyed topics). Delivery via an internal FIFO queue drained while not already draining.
- [ ] **Step 4: Run** `pnpm --filter @poc/event-broker test` and `pnpm --filter @poc/event-broker typecheck` — expect PASS.
- [ ] **Step 5: Commit** `feat(event-broker): topic namespaces, retained state and isolated delivery`.

### Task 3: Broker transitions, session revision, lifecycle wrapper

**Files:**
- Modify: `packages/event-broker/src/createEventBroker.ts`, `src/index.ts`, `src/createEventBroker.test.ts`

**Interfaces:**
- Consumes: Task 2 `EventBroker`; `RemoteLifecycle` from `@poc/platform-contracts`.
- Produces: `EventBroker.registerRemote(remoteId: string, lifecycle: RemoteLifecycle): RemoteLifecycle` — wrapper whose `block` and `dispose` revoke the facade (like `ShellRuntime.registerRemote`; a stale wrapper after re-register must not touch the current mount). Broker subscribes to `options.session` for its whole life and unsubscribes in `dispose`.

- [ ] **Step 1: Write failing tests:** with a controllable fake session, on `transitioning`: retained `events.counter` reads `undefined`, retained `shell.*` is kept, queued events are dropped, remote `publish`/`setState` are silently dropped (no throw, `observe` sees nothing), `publishFromShell` events are dropped, `setShellState` still applies; after the session returns to `authenticated` with a higher `contextRevision`, new messages carry the new revision; `state("events.counter").subscribe` fires once when the retained value is cleared by a transition; `on()` and `state()` calls during a transition succeed; `registerRemote(...).block(reason)` revokes the facade and still calls the inner `block`; `dispose()` of a wrapper does the same; calling `forRemote("events")` again revokes the old facade, and the old facade's handlers never fire again; a stale wrapper's `block` after re-register does not revoke the new facade.
- [ ] **Step 2: Run** `pnpm --filter @poc/event-broker test` — expect FAIL on the new cases.
- [ ] **Step 3: Implement** the session subscription, a `transitioning` flag cached from it (commands never read the session, matching `createShellRuntime`), clearing, and `registerRemote`.
- [ ] **Step 4: Run** `pnpm --filter @poc/event-broker test` — expect PASS (all cases).
- [ ] **Step 5: Commit** `feat(event-broker): fail closed across session transitions and revoke with lifecycle`.

### Task 4: Signals adapter and React hook

**Files:**
- Create: `packages/events-signals/{package.json,tsconfig.json,src/index.ts,src/react.ts,src/events-signals.test.ts}`; `package.json` exports `.` (core) and `./react`; deps `@preact/signals-core` (exact pin), `@poc/platform-contracts`; `react` as a peer dependency used only by `./react`.

**Interfaces:**
- Consumes: `EventsApi`, `EventMessage`, `TopicState` (Task 1).
- Produces (`src/index.ts`):
  ```ts
  export function topicSignal<T>(events: EventsApi, topic: string): { signal: ReadonlySignal<T | undefined>; dispose(): void };
  export function eventSignal<T = unknown>(events: EventsApi, topic: string): { signal: ReadonlySignal<EventMessage<T> | undefined>; dispose(): void };
  ```
  (`src/react.ts`): `export function useTopic<T>(events: EventsApi | undefined, topic: string): T | undefined` via `useSyncExternalStore` over `events.state(topic)`; returns `undefined` when `events` is absent. No `@preact/signals-react`.

- [ ] **Step 1: Write failing tests** with a hand-written fake `EventsApi` (no broker dependency): `topicSignal` initial value equals `state().get()`, updates after the fake notifies, and stops after `dispose`; `eventSignal` holds the latest message; an `effect` from the same `signals-core` copy re-runs on update; **cross-copy proof:** after `vi.resetModules()` load a second copy of `@preact/signals-core` and assert that a signal created by copy A is not tracked by an `effect` from copy B (documenting why signals must not cross the contract), while `topicSignal` bound to copy B driven by the plain-function fake works with copy B's `effect`. `useTopic` (react-dom/test-utils or `@testing-library/react` if already in the repo, else `react-dom/client` + `act`) renders the retained value, rerenders on change, and returns `undefined` for an absent `events`.
- [ ] **Step 2: Run** `pnpm --filter @poc/events-signals test` — expect FAIL.
- [ ] **Step 3: Implement** both entries; `topicSignal` subscribes eagerly and writes `signal.value = state.get()` in the listener.
- [ ] **Step 4: Run** `pnpm --filter @poc/events-signals test` and `typecheck` — expect PASS.
- [ ] **Step 5: Commit** `feat(events-signals): topic and event signals plus React hook`.

### Task 5: Optional events wiring in `@poc/shell-ui`

**Files:**
- Modify: `packages/shell-ui/src/types.ts` (`DiMode` adds `"D"`, `RemoteSlotId` adds `"events"`, `ShellUiProps` gains `events?: EventBroker` and `extraRemotes?: { id: RemoteSlotId; title: string; route: string; load: RemoteLoader }[]`), `RemoteHost.tsx` (optional `events` prop; mounts with `{...capabilities, shell, events: events?.forRemote(id)}` and registers `registry.register(id, events ? events.registerRemote(id, runtime.registerRemote(id, handle.lifecycle)) : runtime.registerRemote(...))`; unregister also calls `events?.unregisterRemote(id)`), `ShellApp.tsx` (merge `extraRemotes` into `ROUTES` and the remote grid, one mount toggle each with `data-testid="toggle-<id>"`, render `EventsPanel` when `events` is set), `index.ts`, `package.json` (depend on `@poc/event-broker`)
- Create: `packages/shell-ui/src/EventsPanel.tsx`

**Interfaces:**
- Consumes: `EventBroker` (Tasks 2–3), `RemoteHost` and `ShellApp` as they exist.
- Produces: `EventsPanel({ events, runtime }: { events: EventBroker; runtime: ShellRuntime })`: renders a log (last 20 `observe` messages: `data-testid="events-log"`, one `<li data-testid="events-log-item">` per message as text `from topic json`) and a button `data-testid="send-notice"` that calls `events.publishFromShell("shell.notice", { text: "notice <n>" })`. Also mirrors `runtime.getState()` into the broker via `events.setShellState("shell.path"|"shell.language"|"shell.user", …)` on mount and on every `runtime.subscribe` notification (only changed values), and cleans up on unmount. No inline `style` (`check:styles`).

- [ ] **Step 1: Write failing check:** extend shell-ui's existing typecheck by importing the new props in a type-level fixture only if shell-ui has tests; otherwise this task's failing step is `pnpm --filter @poc/shell-ui typecheck` after adding the prop types to `ShellApp` usage in `apps/shell-injected` untouched (must still compile). If shell-ui has no test runner, add one vitest test for `EventsPanel`'s mirroring using the real `createShellRuntime` and `createEventBroker` with a stub session: assert `state("shell.path").get()` follows `runtime.shellNavigate`, and that no `shell.*` write happens when state is unchanged.
- [ ] **Step 2: Run** `pnpm --filter @poc/shell-ui typecheck` (+ test if added) — expect FAIL until implemented.
- [ ] **Step 3: Implement** the changes above; with `events` and `extraRemotes` undefined the rendered output and routes must equal today's (`ROUTES = { "/orders": "react", "/summary": "vue" }`).
- [ ] **Step 4: Run** `pnpm typecheck && pnpm --filter @poc/shell-ui check:styles && pnpm --filter @poc/shell-injected build && pnpm --filter @poc/shell-injected check:css` — expect PASS (proves A is unaffected and the shell CSS probe still holds).
- [ ] **Step 5: Commit** `feat(shell-ui): optional events broker and extra remotes`.

### Task 6: New remote `remote-events`

**Files:**
- Create: `apps/remote-events/{package.json,tsconfig.json,rsbuild.config.ts,module-federation.config.ts,src/{mount.ts,bootstrap.ts,styles.css,view.ts}}`

**Interfaces:**
- Consumes: `topicSignal`/`eventSignal` (Task 4), `MountCapabilities`, design-system `variants` class strings.
- Produces: federated module `eventsRemote` exposing `./mount` (`RemoteMount`), dev port `5003`, `check:css` script `node ../../packages/design-system/scripts/check-built-css.mjs dist --remote .proportional-nums`, `"@poc/events-signals": "workspace:*"` dependency. Copy `rsbuild.config.ts`/MF config from `apps/remote-vue` (no react), `styles.css` from `apps/remote-react` (`@import "@poc/design-system/remote.css"; @source "./";`), standalone bootstrap imports `@poc/design-system/standalone.css` only there.
- Behaviour (test ids are the contract used by Task 9): vanilla DOM built with `textContent`; shows `shell.path|language|user` from `topicSignal`s via `effect` (`events-shell-path`, `events-shell-language`, `events-shell-user`); shows last `shell.notice` text (`events-last-notice`); button `events-ping` publishes `events.ping` `{ n }` and sets retained `events.counter` to `n` (`events-counter` shows own value); shows the last `react.ack` payload (`events-last-ack`). Works with `capabilities.events` absent (shows "events unavailable", no throw). Lifecycle: `prepareTransition`/`resetIdentityState` reset the local counter and displayed values (throw when `forceCleanupFail`, like the other remotes), `resume` republishes `events.counter`, `block` shows a blocked message, `dispose` calls the signal `dispose`s and removes DOM; commands in `block`/`dispose` are never called. Catches only `FACADE_REVOKED` by `error.name`+`code`.

- [ ] **Step 1: Write failing test** `src/view.test.ts` (vitest + `jsdom` only if already available in the repo, else assert on a pure `renderView(state)` string/DOM-builder): given fake `EventsApi`, `mount` renders path/notice, `events-ping` click publishes `events.ping` with `{n:1}` and sets `events.counter`, absent `events` renders "events unavailable".
- [ ] **Step 2: Run** `pnpm --filter @poc/remote-events test` — expect FAIL.
- [ ] **Step 3: Implement** `mount.ts` and `view.ts`; use classes from `@poc/design-system/variants` plus the probe class `proportional-nums` on the counter.
- [ ] **Step 4: Run** `pnpm --filter @poc/remote-events test && pnpm --filter @poc/remote-events typecheck && pnpm --filter @poc/remote-events build && pnpm --filter @poc/remote-events check:css` — expect PASS.
- [ ] **Step 5: Commit** `feat(remote-events): vanilla signals remote`.

### Task 7: New shell D `shell-events`

**Files:**
- Create: `apps/shell-events/` copied from `apps/shell-injected` (`package.json` name `@poc/shell-events`, `modern.config.ts` port `8093`, `module-federation.config.ts` name `shell_events` with remotes `reactRemote`, `vueRemote` and `eventsRemote@http://localhost:5003/mf-manifest.json`, `src/remotes.d.ts` adds `eventsRemote/mount`, `src/App.tsx`)
- Modify: root `package.json` (add `"dev:d"` running mock-api, remote-react, remote-vue, remote-events, shell-events; leave `dev:poc` unchanged), `pnpm-workspace` needs no change.

**Interfaces:**
- Consumes: `ShellApp` props from Task 5, `createEventBroker`.
- Produces: `App.tsx` creates the coordinator exactly like shell A, `createEventBroker({ session: api })` in the same `useMemo`, passes `diMode="D"`, title `Shell Events — DI A + event channel`, `events={broker}`, `extraRemotes=[{ id: "events", title: "Signals remote (events)", route: "/events", load: () => import("eventsRemote/mount") }]`, and `resolveRemoteCapabilities` identical to A (events are added per remote by `RemoteHost`). Broker disposed on unmount.

- [ ] **Step 1: Failing check:** `pnpm --filter @poc/shell-events typecheck` — expect FAIL (app not yet written; create `package.json` and config first so the command resolves).
- [ ] **Step 2: Implement** the app.
- [ ] **Step 3: Run** `pnpm install && pnpm --filter @poc/shell-events typecheck && pnpm --filter @poc/shell-events build && pnpm --filter @poc/shell-events check:css` — expect PASS.
- [ ] **Step 4: Manual smoke:** `pnpm dev:d`, open `http://localhost:8093`, click "Send notice", confirm the `events` remote shows it and the log lists it. Report the result honestly.
- [ ] **Step 5: Commit** `feat(shell-events): shell D with event broker`.

### Task 8: Optional receiver in `remote-react`

**Files:**
- Modify: `apps/remote-react/src/mount.tsx`, `apps/remote-react/src/App.tsx`, `apps/remote-react/package.json` (add `@poc/events-signals`), `apps/remote-react/src/i18n.ts` only if new visible strings need translation (follow the existing `t(language, …)` usage)
- Create: `apps/remote-react/src/eventsAdapter.ts`

**Interfaces:**
- Consumes: `useTopic` from `@poc/events-signals/react`, `capabilities.events` (optional).
- Produces: `App` takes optional `events?: EventsApi` and renders `data-testid="react-events-counter"` (retained `events.counter` via `useTopic`, "—" when undefined) and `data-testid="react-events-last-ping"` (latest `events.ping` message via `events.on` in an effect). On each ping it publishes `react.ack` `{ n }` through `tryEvents(() => events.publish(...))` (catch only `FACADE_REVOKED` by name+code, same pattern as `tryShell`). In `resume()` it republishes nothing (it owns no retained topic) and clears its displayed last ping in `resetIdentityState`. Nothing renders or throws when `events` is absent; shells A/B/C pass none.

- [ ] **Step 1: Write failing test** in `apps/remote-react` only if the app has a test runner; otherwise the failing step is `pnpm --filter @poc/remote-react typecheck` after adding the optional `events` prop to the `App` usage in `mount.tsx`.
- [ ] **Step 2: Implement** per Interfaces; keep `mount.tsx` diff minimal.
- [ ] **Step 3: Run** `pnpm --filter @poc/remote-react typecheck && pnpm --filter @poc/remote-react build && pnpm --filter @poc/remote-react check:css` and `SHELL_A_URL=http://localhost:8090 pnpm test:e2e --project shell-a` — expect PASS (A unchanged).
- [ ] **Step 4: Commit** `feat(remote-react): optional event channel receiver`.

### Task 9: Playwright coverage for shell D

**Files:**
- Create: `tests/e2e/specs/d-events.spec.ts`, `tests/e2e/page-objects/EventsShellPage.ts`
- Modify: `tests/e2e/playwright.config.ts` (project `shell-d`, `SHELL_D_URL` default `http://localhost:8093`, `testMatch: /d-.*\.spec\.ts/`), `tests/e2e/global-setup.ts` (add health gates for `8093` and `5003` the same way the existing ones are gated; skip them when only A is requested if that is how the file already behaves)

**Interfaces:**
- Consumes: test ids from Tasks 5–8; mock-api `__controls` helpers already in `ShellPage.ts`.
- Produces: scenarios, deterministic via `__controls`:
  1. shell→remote: click `send-notice`; `events-last-notice` shows the text.
  2. shell state as signals: navigate to `/events` then `/orders`; `events-shell-path` follows; switching language updates `events-shell-language`.
  3. remote→shell: `events-ping` click appears in `events-log`.
  4. remote→remote: ping → `react-events-last-ping` shows it and `events-last-ack` shows `react.ack` `{ n }`; `react-events-counter` shows the retained counter.
  5. transition: after ping (counter 1), switch account; `react-events-counter` and `events-last-ack` show no old value and `events-counter` is reset; a ping after resume works again with the new revision.
  6. revoke: unmount the `events` remote (`toggle-events`); `send-notice` does not break the shell and a new ping from react is not required; remount works.

- [ ] **Step 1: Write the spec** (scenarios 1–6) and config/global-setup changes.
- [ ] **Step 2: Run** `pnpm dev:d` in one terminal, then `SHELL_D_URL=http://localhost:8093 pnpm test:e2e --project shell-d` — expect FAIL first only if the wiring is wrong, otherwise PASS; fix wiring bugs in earlier tasks' files, not the tests, if scenario 5 fails (it is the fail-closed proof).
- [ ] **Step 3: Run** the full existing suite `pnpm test:e2e` — expect A, B/C smoke and D all PASS.
- [ ] **Step 4: Commit** `test(e2e): shell D event channel scenarios`.

### Task 10: Docs and final verification

**Files:**
- Modify: `AGENTS.md` (ownership: add `@poc/event-broker` shell-internal row, `@poc/events-signals` remote-side row, `EventsApi` rules from Global Constraints, shell D in Commands/Ports `8093`/`5003`), `docs/limitations.md` (events are same-realm and unauthenticated for reads, no delivery guarantee, silent drop during transition, signals must not cross the contract because of per-copy reactivity globals), `README.md` (shell D row, `pnpm dev:d`, ports), `docs/architecture.md` (one pointer to the spec)

- [ ] **Step 1: Update docs** as listed.
- [ ] **Step 2: Run the full gate:** `pnpm install && pnpm ci` (typecheck, unit, build, check:css) then `pnpm test:e2e` — expect all green. If anything fails, report the output and which task owns it; do not weaken tests.
- [ ] **Step 3: Commit** `docs: event channel rules, limitations and shell D`.

---

## Self-review notes

- Spec coverage: contract (T1), broker rules/revision/revocation (T2–T3), adapter + cross-copy spike (T4), shell wiring (T5, T7), new remote (T6), `remote-react` receiver (T8), tests (T1–T4, T9), docs (T10). The spec's `shell.user` payload shape is left to T5 (`ShellUser | null` as exposed by `ShellRuntime.getState().user`).
- Calls beyond the spec, for the owner to check: `INVALID_PAYLOAD` error code; `shell.notice` dropped during a transition; `ShellApp` gains `extraRemotes` instead of a second shell-ui; the signals `./react` entry is split so vanilla remotes do not bundle React.
