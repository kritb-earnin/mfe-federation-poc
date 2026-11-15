# Limitations

## Simulated, not production auth

- Fictional users/accounts only.
- No real IdP, tokens, refresh, or cookie security model.
- mock-api request-scope headers demonstrate the idea; they are not a production security boundary.
- Client-sent `accountId` alone is not authorization.

## Same JS realm

Module Federation remotes share the page realm. Capability injection does not sandbox untrusted code.

## SSR / native excluded

Production SSR needs request-scoped session state. Native/WebView and cross-origin iframe messaging need adapters beyond this POC.

## DI C coupling

`@poc/shared-session-store` is an intentional anti-pattern for comparison.

## Environment notes

- Port `8080` may be occupied by unrelated local proxies (e.g. gvproxy); Modern.js will pick the next free port. Prefer freeing `8080` for documented `pnpm dev:poc` / E2E.
- Playwright requires browser binaries installed once.
