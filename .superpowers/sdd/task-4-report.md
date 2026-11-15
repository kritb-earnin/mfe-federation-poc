# Task 4: mock-api report

Implemented `@poc/mock-api` on port 4010 using Express and GraphQL. It serves health, fictional session login/logout/account routes, account-scoped REST orders and GraphQL summaries, and resettable delay/failure/cleanup controls. Data is limited to `user_ava`/`user_beau`, `acct_north`/`acct_south`, and fictional orders; data routes reject missing or mismatched scope headers with HTTP 403.

## Verification

- Started with `pnpm --filter @poc/mock-api dev`.
- `GET /health` returned HTTP 200 and `{"ok":true}`.
- `GET /api/orders` without scope returned HTTP 403; scoped North orders returned HTTP 200 and only North orders.
- Scoped GraphQL `accountSummary` returned `acct_north`, its fictional name, and `openOrders: 1`.
- Session login, account selection, and logout returned HTTP 200 for `user_ava` / `acct_north`.
- Enabling cleanup failure was reflected by `GET /__controls/state`; reset returned `{"ok":true}`.
- Scoped order-note mutation returned HTTP 200; controls were reset after the check.

The dev server was left running on port 4010 for the requested manual verification.

## Review fixes

- Added CORS for browser origins `http://localhost:8080`–`8082` and `http://localhost:5001`–`5002`, including the session/account/content-type headers and preflight `OPTIONS`.
- Aligned `MockApiControls` request bodies with the controls router: delay `{ ms }`, fail-next `{ route, status? }`, and cleanup-fail `{ enabled }`.

- Follow-up verification: `GET /health` returned HTTP 200 with `{"ok":true}`; posting `{"ms":0}` to `/__controls/delay` returned HTTP 200 with `{"ok":true}`.
- CORS preflight from `http://localhost:8080` returned HTTP 204 with the configured allowed origin, methods, and headers.
