# Event Channel: shell↔remote and remote↔remote messaging (shell D)

**Status:** Draft for user review
**Date:** 2026-11-18
**Type:** POC extension. Builds on `2026-11-16-shell-api-layout-design.md`. Not production.

## 1. Intent

Owner observation: with the injected shell (A) it is hard to write the *receiving* side in a remote. `ShellApi.subscribe(onChange)` only says "something changed"; each remote re-reads `getState()`, diffs it, and wraps it per framework (`useShellState` in React, a `shallowRef` in Vue). There is no way for the shell to push a discrete message to a remote, and no remote→remote path at all.

This work adds a robust, uniform way to communicate in all three directions (shell→remote, remote→shell, remote→remote), plus a signals-based adapter so a remote can receive with one call. It is delivered as a **new shell (D)** and a **new remote**, alongside A/B/C, so the approaches can be compared.

## 2. Goals, non-goals, anti-goals

**Goals**
- A framework-neutral `EventsApi` in `@poc/platform-contracts`: fire-and-forget events plus retained "last value" topics. Plain functions only, no library in the contract.
- A shell-owned broker. The shell decides the sender's identity (never the payload), enforces topic namespaces, and revokes a remote's publishing and subscriptions with its facade.
- Safe across session transitions: events and retained values from the old context never reach remotes after a transition starts (same fail-closed spirit as `AGENTS.md`).
- A small remote-side adapter package that turns a topic into a `@preact/signals-core` signal (any framework/vanilla) and a React hook, so a receiver is one line.
- New shell `D` (`apps/shell-events`, port 8093) and new remote `remote-events` (port 5003, vanilla TS + signals-core), with shell→remote, remote→shell and remote→remote demonstrated, including across a session transition.
- Unit tests for the broker and adapter; Playwright smoke for D. A/B/C and their 9 scenarios stay unchanged and green.

**Non-goals**
- Replacing `ShellApi` or `SessionApi` (they stay as is; `EventsApi` is a separate capability).
- Vue adapter, cross-tab/cross-origin messaging, persistence, delivery guarantees, request/response RPC, ordering across topics.
- Making `@preact/signals-*` a federated singleton (see Approaches).

**Anti-goals (failure even if it works)**
- A remote publishing as another remote, or on `shell.*`.
- Old-account events or retained values visible to a remote after a transition starts.
- A revoked/blocked/unmounted remote still receiving or sending.
- Remotes importing the broker or shell internals; a raw store, `setState` or the broker object leaking into the contract.
- Reactivity that silently stops working because two copies of a library were loaded.

## 3. Constraints

- `AGENTS.md` ownership rules hold: `@poc/platform-contracts` is types + small validators; the broker is shell-internal like `@poc/session-coordinator`; remotes depend only on contracts (plus the new remote-side adapter).
- `MountCapabilities` gains optional `events?: EventsApi`. A remote must work without it.
- Same JS realm, not a sandbox; `docs/limitations.md` says so.
- `@poc/platform-contracts` is not shared through Module Federation, so cross-bundle checks use `error.name` / `error.code`, never `instanceof`.
- Payloads are fictional and structured-cloneable; never rendered as HTML.

## 4. Approaches considered

- **A. Typed channel, no library.** Smallest, robust across bundles; receivers still need a per-framework hook.
- **B. Signals as the contract.** Least receiver code, but `signals-core` tracking is a module-level global, so it must be a federated singleton or `effect`s silently stop; `signals-react` is React-only and patches React internals; signals fit state, not events.
- **C. Hybrid (chosen by owner).** Contract = plain functions (A). Signals live only in an optional adapter that each remote binds at its own edge, so no singleton is needed for correctness and signals-core can be compared against the hook.

Chosen: **C**, delivered as a new shell + new remote.

## 5. Design (decisions made with the owner are marked; the rest are my calls)

**Contract (`packages/platform-contracts/src/events.ts`)**
```ts
export const EVENTS_CONTRACT_VERSION = 1 as const;
export type EventMessage<T = unknown> = {
  topic: string; payload: T; from: string; // "shell" or a remote id, set by the broker
  contextRevision: number; seq: number;
};
export interface TopicState<T> { get(): T | undefined; subscribe(onChange: () => void): () => void }
export interface EventsApi {
  readonly contractVersion: typeof EVENTS_CONTRACT_VERSION;
  publish(topic: string, payload: unknown): void;            // event, no replay
  on(topic: string, handler: (m: EventMessage) => void): () => void;
  setState(topic: string, value: unknown): void;             // retained last value
  state<T = unknown>(topic: string): TopicState<T>;
}
export type EventsErrorCode = "INVALID_TOPIC" | "NOT_OWNER" | "PAYLOAD_TOO_LARGE" | "FACADE_REVOKED";
```
`EventsCommandError` mirrors `ShellCommandError` (matched by `name` + `code`).

**Rules (broker, `packages/event-broker`, shell-internal)**
- Topic grammar `^[a-z][a-z0-9-]*(\.[a-z0-9-]+)+$`; first segment is the owner namespace. A remote may `publish`/`setState` only on its own id namespace (`events.*` for `events`); `shell.*` only the shell. Anyone may `on`/`state` any topic. (My call: reads are open because the data is fictional and the shell is the policy point if that changes.)
- Sender is taken from the facade, never from the payload. Payload: structured-cloned and frozen on publish, max 4 KB (my call), else `PAYLOAD_TOO_LARGE`.
- Delivery is synchronous, per-subscriber isolated with try/catch (one failing handler does not skip others), re-entrancy safe (publishes from a handler are queued after the current delivery). No replay for events; `state()` returns the current retained value immediately.
- Shell publishes retained `shell.path`, `shell.language`, `shell.user` mirrored from the shell runtime, plus event `shell.notice` (shell→remote demo).
- **Transition rules:** when a session transition starts the broker bumps its revision, clears all retained state outside `shell.*`, drops queued events, and silently drops `publish`/`setState` from remotes while `transitioning` (no new error code; matches `ShellApi.setLayout`, and keeps the "catch only FACADE_REVOKED / SLOT_TAKEN" rule; builder-check call). Remotes cannot tell a message was dropped, so they republish in `resume()`. `shell.*` retained values reset like `ShellApi` (path to route root, user cleared). Remotes receive `resume` and may republish. `contextRevision` on a message is the session coordinator's value: the broker subscribes to `SessionApi` and mirrors it, so receivers can compare it with the snapshot they see (builder-check call). Messages carry it; receivers may ignore older ones.
- **Revocation:** a blocked or unmounted remote's facade is revoked: its subscriptions are dropped, its retained topics cleared, later calls throw `FACADE_REVOKED`. Never call events commands in `block`/`dispose` (same rule as the shell API).

**Remote-side adapter (`packages/events-signals`, depends on `@preact/signals-core`, bundled per remote, not shared)**
- `topicSignal<T>(events, topic): ReadonlySignal<T | undefined>` backed by `state(topic)`; `eventSignal(events, topic)` holding the latest message; both return a dispose.
- `useTopic(events, topic)` React hook (via `useSyncExternalStore` over `state()`; no `@preact/signals-react`, avoiding its React-internals patching).

**New shell D (`apps/shell-events`, port 8093)**: copy of A's wiring (`@poc/shell-ui`), plus the broker, an event-log panel, and a "send notice to remotes" button. Mounts `remote-react`, `remote-vue` and `remote-events`. A/B/C and `shell-ui` public behaviour unchanged; the broker is wired through optional `ShellApp` props.
**New remote `remote-events` (port 5003)**: vanilla TS + signals-core via the adapter, same design-system/`check:css` rules as other remotes. It shows shell state via signals, receives `shell.notice`, publishes `events.ping` on a button, and publishes a retained `events.counter`.
**Existing remotes:** `remote-react` gains an optional, absent-safe receiver (uses `useTopic` to show the last `events.ping` and publishes `react.ack`). Remote→remote is therefore `events` ↔ `react`. `remote-vue` is untouched. (My call; owner may prefer a second new remote instead.)

**Docs:** `AGENTS.md` (ownership + rules), `docs/limitations.md`, `README.md` (shell D, ports), `docs/architecture.md` pointer.

## 6. Testing
- Broker unit tests: namespace/NOT_OWNER, sender spoofing impossible, retained vs event semantics, handler isolation, re-entrancy, size limit, transition clearing and rejection, revocation, `shell.*` mirror.
- Adapter tests: signal updates, dispose, `effect` works with the remote's own signals-core copy.
- Playwright smoke on D: shell→remote notice, remote→shell, remote→remote, and nothing from the old account after an account switch; deterministic via mock-api `__controls`.
- Verification spike before building: confirm that two bundled copies of signals-core with no singleton behave as designed (each remote's `effect` fires from the plain-function contract).

## 7. Left to the builder
Exact file layout, rsbuild/MF config copied from the existing apps, event-log UI details, the final `shell.user` payload shape, and how to wire `ShellApp` props (minimal diff).
