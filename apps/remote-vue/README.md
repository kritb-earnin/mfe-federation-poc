# Vue account summary remote

This Rsbuild Module Federation remote exposes `./mount` as a Vue 3 remote lifecycle implementation. It uses Apollo Client 4 against the local fictional-data mock API.

The query sends both identity headers from the query's captured session snapshot, not mutable current state. Client recreation isolates the old cache, while the revision guard prevents stale results from reaching the UI.

Run `pnpm --filter @poc/remote-vue dev`; the federated manifest is served at `http://127.0.0.1:5002/mf-manifest.json`. The standalone page requires the mock API at `http://127.0.0.1:4010/graphql`.
