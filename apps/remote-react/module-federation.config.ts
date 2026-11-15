import type { ModuleFederationOptions } from "@module-federation/rsbuild-plugin";

const config: ModuleFederationOptions = {
  name: "reactRemote",
  filename: "remoteEntry.js",
  exposes: { "./mount": "./src/mount.tsx" },
  shared: {
    react: { singleton: true, requiredVersion: "^19.0.0" },
    "react-dom": { singleton: true, requiredVersion: "^19.0.0" },
  },
};

export default config;
