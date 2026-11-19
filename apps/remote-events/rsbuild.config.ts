import { pluginModuleFederation } from "@module-federation/rsbuild-plugin";
import { defineConfig } from "@rsbuild/core";
import tailwindcss from "@tailwindcss/postcss";
import mfConfig from "./module-federation.config.js";

export default defineConfig({
  server: { host: "127.0.0.1", port: 5003 },
  plugins: [pluginModuleFederation(mfConfig)],
  source: { entry: { index: "./src/bootstrap.ts" } },
  tools: {
    postcss: (_, { addPlugins }) => {
      addPlugins(tailwindcss());
    },
  },
  html: { title: "Fictional Events Signals Remote" },
});
