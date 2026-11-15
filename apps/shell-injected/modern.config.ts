import { appTools, defineConfig } from "@modern-js/app-tools";
import { moduleFederationPlugin } from "@module-federation/modern-js-v3";

export default defineConfig({
  // 8090: avoid common local proxies bound to 8080 (e.g. gvproxy).
  server: { port: 8090 },
  source: {
    enableAsyncEntry: true,
  },
  plugins: [appTools(), moduleFederationPlugin()],
});
