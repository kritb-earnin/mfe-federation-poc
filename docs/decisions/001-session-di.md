# 001 — Session DI styles

## Context

Need a framework-neutral way for independently built remotes to observe and command shell-owned session state without coupling to Modern.js, React, or Zustand.

## Options

### A. Shell-injected SessionApi (baseline)

Shell constructs one coordinator and passes `session` into `mount()`.

**Pros:** Explicit ownership; no package singleton; remotes stay on contracts only; easy testing.  
**Cons:** Shell must orchestrate mount for every remote.

### B. Federated accessor returning shell-owned API

Host exposes `./session` (`getSessionApi`) via Module Federation; mount still passes `resolveSession`.

**Pros:** Demonstrates federated retrieval; same owner as A.  
**Cons:** Remotes can hardcode host alias; harder to reason about readiness; still needs host orchestration for lifecycle.

### C. Direct shared singleton Zustand package

`@poc/shared-session-store` module singleton adapted to SessionApi.

**Pros:** Convenient.  
**Cons:** Couples remotes to package identity; multiple shells/tests share state accidentally; hides ownership. **Anti-pattern for production.**

### D. Events-only sharing

CustomEvent / EventTarget without a snapshot API.

**Pros:** Loose coupling.  
**Cons:** No stable snapshot identity; racey late subscribers; hard to gate protected work.

## Decision

Implement **A as baseline** with full E2E. Ship **B and C** as comparison shells. Document D as rejected for this POC.

## Consequences

- Primary developer path: inject `SessionApi` at mount.
- Measurement and Playwright focus on A.
- C carries an explicit UI banner warning.
