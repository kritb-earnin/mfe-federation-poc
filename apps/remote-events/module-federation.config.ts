import type { ModuleFederationOptions } from "@module-federation/rsbuild-plugin";

const config: ModuleFederationOptions = {
  name: "eventsRemote",
  filename: "remoteEntry.js",
  exposes: { "./mount": "./src/mount.ts" },
};

export default config;
