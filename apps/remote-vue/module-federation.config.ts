import type { ModuleFederationOptions } from "@module-federation/rsbuild-plugin";

const config: ModuleFederationOptions = {
  name: "vueRemote",
  filename: "remoteEntry.js",
  exposes: { "./mount": "./src/mount.ts" },
  shared: { vue: { singleton: true, requiredVersion: "^3.5.0" } },
};

export default config;
