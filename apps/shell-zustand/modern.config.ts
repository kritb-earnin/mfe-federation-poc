import { appTools, defineConfig } from "@modern-js/app-tools";
import { moduleFederationPlugin } from "@module-federation/modern-js-v3";

export default defineConfig({
  server: { port: 8092 },
  source: { enableAsyncEntry: true },
  plugins: [appTools(), moduleFederationPlugin()],
});
