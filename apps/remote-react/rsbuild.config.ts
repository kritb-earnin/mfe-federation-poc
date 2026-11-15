import { defineConfig } from "@rsbuild/core";
import { pluginModuleFederation } from "@module-federation/rsbuild-plugin";
import mfConfig from "./module-federation.config.js";

export default defineConfig({
  server: { host: "127.0.0.1", port: 5001 },
  plugins: [pluginModuleFederation(mfConfig)],
  source: { entry: { index: "./src/bootstrap.tsx" } },
  html: { title: "Fictional React Orders Remote" },
});
