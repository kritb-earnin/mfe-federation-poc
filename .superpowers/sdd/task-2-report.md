# Task 2: Session coordinator

## Result

Implemented `@poc/session-coordinator` with a per-call session store, frozen stable snapshots, listener subscription, independently scoped remote registry and blocked-remotes set, and the `createSessionCoordinator(options) => { api, registry, dispose }` interface.

Session commands publish the transitioning state with an incremented context revision before remote resume. Remotes prepare and clean up before the auth bridge runs; cleanup failures block the affected remote and fail closed. Prepare timeouts abort the transition, block registered remotes, publish error state, and reject with `TRANSITION_TIMEOUT`. Concurrent commands supersede prior commands with `TRANSITION_SUPERSEDED`. `dispose()` removes listeners, disposes registered remotes, and clears coordinator state.

## Tests

Added eight complete tests covering stable snapshot identity, subscription and unsubscription, per-call coordinator independence, anonymous-to-transitioning-to-authenticated sequencing and revision-before-resume, competing account changes, prepare timeout/block/fail-closed behavior, stale revision callback rejection, and cleanup failure/block/no-resume behavior.

- `pnpm --filter @poc/session-coordinator test` — PASS (8 tests)
- `pnpm --filter @poc/session-coordinator typecheck` — PASS

## TDD notes

The initial test invocation failed while loading the package because the new tsconfig extended a nonexistent root `tsconfig.json`; it was corrected to the existing `tsconfig.base.json`. The tests were not successfully executed against the absent implementation before implementation began. The final suite and typecheck pass.

## Commit

`feat: add session-coordinator with transition protocol`
## P1 hardening

Serialized remote prepare/reset/resume lifecycle work so superseded callers reject immediately without overlapping remote work. Transition deadlines now cover auth and resume, late auth completion cannot publish success, and timeout blocks remotes, including during identity reset.

Added failure-path tests for slow competing transitions, hanging auth, and hanging reset.

- `pnpm --filter @poc/session-coordinator test` — PASS (10 tests)
- `pnpm --filter @poc/session-coordinator typecheck` — PASS
