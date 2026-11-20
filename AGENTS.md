# AGENTS.md — Session Coordination MFE POC

## Ownership boundaries

- **Shell (per browser instance):** owns exactly one session coordinator, remote registry, transition orchestration, and the debug UI.
- **Shell `ShellApi` (per remote facade):** shell owns navigation (`path`), language, user state and the layout/slot regions (`header`, `sidebar`). Remotes own caches and local state.
- **Remotes:** own QueryClient / ApolloClient, domain caches, and local feature state.
- **`@poc/platform-contracts`:** types + small validators only. No store instances.
- **`@poc/session-coordinator`:** shell-internal. Remotes must not import it.
- **`@poc/shell-state`:** shell-internal (same rule as the coordinator). Remotes must not import it; they only see `ShellApi` from `@poc/platform-contracts`.
- **`@poc/event-broker`:** shell-internal (same rule as the coordinator). Remotes must not import it; they only see `EventsApi` from `@poc/platform-contracts`.
- **`@poc/events-signals`:** remote-side adapter (`topicSignal`, `eventSignal`, `useTopic`). Each remote bundles its own `@preact/signals-core`; signals never cross the contract.
- **`@poc/shared-session-store`:** DI **C** demo only (anti-pattern).
- **Design system:** the shell owns token values (`tokens.css`) and preflight. Remotes own their Tailwind build and may import `@poc/design-system` / `@poc/design-system-vue` for UI only. See `docs/design-system.md`.

## Session lifecycle rules

1. Enter `transitioning` and advance `contextRevision` before remote cleanup.
2. Call `prepareTransition` then `resetIdentityState` on registered remotes.
3. Confirm new fictional context with mock-api.
4. Publish snapshot; `resume` eligible remotes.
5. Cleanup failure → fail closed (`block`); do not resume with old data.
6. Competing commands: single-flight; superseded commands reject with `TRANSITION_SUPERSEDED`.
7. In-flight mutations may finish under the old revision; never auto-retry under a new account.

Read/subscribe alone is **not** proof that cleanup completed.

Shell layout/slot facts:

- When a transition starts the shell clears all layouts and holds slot claims (slot content is removed), and drops `setLayout` calls made while `transitioning`.
- A blocked or unmounted remote's facade is revoked: its layout and slots are removed and later commands throw `FACADE_REVOKED`.
- `path` is truncated to its route root (e.g. `/orders/123` -> `/orders`) when a transition starts; ids in a path belong to the old account.

## Query / cache responsibilities

- Keep domain data in remote-owned caches.
- Use account + `contextRevision` in query identity.
- Drop obsolete responses after revision changes.
- Vue remote recreates Apollo Client + cache on identity reset (`clearStore` alone is insufficient).

## Adding a remote without shell coupling

1. Export `mount(element, capabilities): MountHandle` via Module Federation.
2. Resolve session with `capabilities.session ?? capabilities.resolveSession?.()`.
3. Implement `RemoteLifecycle`.
4. Depend on `@poc/platform-contracts`, and optionally the UI-only `@poc/design-system` / `@poc/design-system-vue` (never `@poc/shell-state` or `@poc/session-coordinator`), and optionally `@poc/events-signals` (remote-side adapter for `capabilities.events`).
5. Optionally resolve `capabilities.shell` and use `navigate`, `setLanguage`, `setLayout`, `claimSlot` per the rules above, and optionally `capabilities.events` (see the event channel rules).
6. Register the remote in the shell MF config and mount it through `@poc/shell-ui` `RemoteHost`.
7. Adopt the design system: `src/styles.css` importing `@poc/design-system/remote.css`, `tools.postcss` with `@tailwindcss/postcss`, `import "./styles.css"` from the exposed `mount` module, `check:css` script. Steps in `docs/design-system.md`.

Shell API rules for remotes:

- Resolve `capabilities.shell` optionally; the remote must work without it.
- Release layout and slots in `dispose`/`block` via the release functions returned by `setLayout`/`claimSlot`. Never call shell commands there (the facade may already be revoked).
- Re-send the layout in `resume()` and whenever path, language or session changes.
- Build slot content from current state only: the shell calls `render(el)` again after each `resume`.
- Catch only `FACADE_REVOKED` and `SLOT_TAKEN` from shell commands. Match by `error.name === "ShellCommandError"` and `error.code`, **not** `instanceof`: `@poc/platform-contracts` is not shared through Module Federation, so remotes hold a different class copy.

Styling rules for remotes:

- Use semantic tokens only (`bg-primary`, `text-muted-foreground`, ...). No colour values and no preflight in remote CSS; the shell owns both.
- Components must be correct without preflight (remote CSS cannot reset the page).
- Keep native controls native (`select`, checkbox) where e2e depends on them.
- Vue components are controlled natives: props and events, no `v-model`. Their classes come from `@poc/design-system/variants`.
- Do not import `@poc/design-system/tokens.css` or `shell.css` from `mount`; only the standalone entry may use `standalone.css`.

Event channel rules for remotes (shell D; spec `docs/superpowers/specs/2026-11-18-event-channel-design.md`):

- Resolve `capabilities.events` optionally; the remote must work without it.
- Publish and `setState` only on your own id namespace (`events.*` for remote `events`); `shell.*` is shell-only. Reads (`on`, `state`) are open. The broker sets `from`, never the payload.
- Never call events commands in `dispose`/`block` (the facade may already be revoked); unsubscribe via the functions returned by `on`/`state().subscribe`.
- Catch only `FACADE_REVOKED` from events commands. `INVALID_TOPIC`, `NOT_OWNER`, `INVALID_PAYLOAD` and `PAYLOAD_TOO_LARGE` are programmer errors: do not catch them. Match by `error.name === "EventsCommandError"` and `error.code`, **not** `instanceof` (same reason as `ShellCommandError`).
- Republish retained state in `resume()`: the broker clears non-`shell.*` retained topics when a transition starts.
- `publish`/`setState` from remotes during a transition are dropped silently (no error). Do not treat a missing delivery as failure.
- Events never carry credentials or PII; payloads are fictional, at most 4 KB, plain JSON-shaped data only (Map/Set/Date/typed arrays are rejected with `INVALID_PAYLOAD`), and never rendered as HTML.
- Do not pass signals through the contract; bind them at the remote's own edge with `@poc/events-signals`.

Do **not** import shell internals, expose raw Zustand stores/`setState`, tokens, or query clients, or log credentials.

## Commands

```bash
pnpm install
pnpm dev:poc          # mock-api + remotes + shell-injected (A)
pnpm dev:a | dev:b | dev:c | dev:d   # D = event channel shell (8093) + remote-events (5003)
pnpm typecheck
pnpm test:unit
pnpm build
pnpm test:e2e                            # shell A + B/C smoke; shell D is opt-in: pnpm dev:d, then --project shell-d or SHELL_D_URL
pnpm --filter <app> check:css            # after build; shells A/B/C/D (shell-events), remote-react, remote-vue, remote-events
pnpm --filter @poc/shell-ui check:styles
```

Ports: mock-api `4010`, remote-react `5001`, remote-vue `5002`, remote-events `5003`, shells `8090/8091/8092`, shell D `8093`.

## Testing expectations

- Unit: snapshot identity, subscribe/unsubscribe, single coordinator instance, transition sequencing, competing commands, timeouts, revision rejection.
- Playwright (shell A full matrix; B/C smoke; shell D event scenarios in `d-events.spec.ts`, `--project shell-d`): deterministic mock-api `__controls`, page objects, health gates before browser tests.
