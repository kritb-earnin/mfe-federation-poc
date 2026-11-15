# Architecture

## Ownership diagram

```
┌────────────────────────────────────────────────────────────┐
│ Shell (Modern.js CSR)                                      │
│  SessionCoordinator (Zustand vanilla, private)             │
│  RemoteRegistry · transition orchestration · debug UI      │
│  exposes SessionApi via DI A/B/C                           │
│   ┌─────────────────────┐  ┌─────────────────────┐         │
│   │ remote-react        │  │ remote-vue          │         │
│   │ TanStack QueryClient│  │ ApolloClient+cache  │         │
│   │ REST orders         │  │ GraphQL summary     │         │
│   └─────────────────────┘  └─────────────────────┘         │
└────────────────────────────────────────────────────────────┘
                         │
                         ▼
              mock-api :4010 (fictional)
         REST + GraphQL + session + __controls
```

## Mount contract

```ts
mount(element, {
  session?,            // DI A / C
  resolveSession?,     // DI B (and optional C adapters)
  forceCleanupFail?,   // POC scenario hook
  onEvent?,
}): MountHandle // { lifecycle, unmount }
```

## Session transition sequence

1. Publish `transitioning` + advance `contextRevision`.
2. `prepareTransition` on active remotes (cancel/isolate).
3. Confirm next context with mock-api auth bridge.
4. `resetIdentityState` (remote cache reset / Apollo recreate).
5. Publish authenticated/anonymous snapshot.
6. `resume` remotes that are not blocked.

Fail closed on cleanup failure or timeout.

## TanStack / Apollo decisions

- React: one QueryClient per mount; keys include `accountId` + `contextRevision`; `AbortSignal` + revision checks.
- Vue: recreate `ApolloClient` + `InMemoryCache` on identity reset; drop results if revision changed. `clearStore`/`resetStore` alone do not cancel in-flight request/response races.

## Same-realm security limitations

All MF remotes share the browser realm. SessionApi is a capability object, not a security boundary. Malicious remote code can still observe memory/network in this POC.

## Intentionally excluded

Production IdP/token refresh, SSR request-scoped session, native/WebView, cross-origin iframe messaging, cross-tab sync.
