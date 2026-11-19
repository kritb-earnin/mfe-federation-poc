import { appTools, defineConfig } from "@modern-js/app-tools";
import { moduleFederationPlugin } from "@module-federation/modern-js-v3";
import tailwindcss from "@tailwindcss/postcss";

export default defineConfig({
  // 8093: avoid common local proxies bound to 8080 (e.g. gvproxy).
  server: { port: 8093 },
  source: {
    enableAsyncEntry: true,
  },
  tools: {
    postcss: (_, { addPlugins }) => {
      addPlugins(tailwindcss());
    },
  },
  plugins: [appTools(), moduleFederationPlugin()],
});
