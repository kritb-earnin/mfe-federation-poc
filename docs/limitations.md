# Limitations

## Simulated, not production auth

- Fictional users/accounts only.
- No real IdP, tokens, refresh, or cookie security model.
- mock-api request-scope headers demonstrate the idea; they are not a production security boundary.
- Client-sent `accountId` alone is not authorization.

## Same JS realm

Module Federation remotes share the page realm. Capability injection does not sandbox untrusted code.

## Slots are not isolated

Shell slots (`header`, `sidebar`) hand the remote a plain DOM element in the same realm. There is no iframe, shadow DOM or CSS sandbox: a remote can touch anything reachable from its slot element (parents, siblings, global styles) and the shell only empties the element on release/transition.

## ShellCommandError across bundles

`@poc/platform-contracts` is not shared through Module Federation, so the shell and each remote bundle their own `ShellCommandError` class. `instanceof` fails across bundles; match `error.name === "ShellCommandError"` and `error.code`.

## Hash history

`ShellChrome` mirrors `path` into `location.hash` (a push per change) and navigates on `hashchange`. Browser Back/Forward can restore an earlier hash path, including an `/orders/<id>` from a previous account when no transition is running. Only the transition-start truncation to the route root protects against stale ids.

## SSR / native excluded

Production SSR needs request-scoped session state. Native/WebView and cross-origin iframe messaging need adapters beyond this POC.

## DI C coupling

`@poc/shared-session-store` is an intentional anti-pattern for comparison.

## Environment notes

- This workstation binds a proxy on `8080` (gvproxy). Shells therefore use **8090/8091/8092**. If Modern.js falls back from a busy configured port, asset URLs can still target the original port and break the UI.
- Playwright requires browser binaries installed once (`pnpm --filter @poc/e2e exec playwright install chromium`).
- Host must share React with `eager: true` for the React remote mount under Modern.js MF.
