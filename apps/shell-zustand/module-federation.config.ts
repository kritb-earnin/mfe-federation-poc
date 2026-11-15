import { createModuleFederationConfig } from "@module-federation/modern-js-v3";

const config = createModuleFederationConfig({
  name: "shell_zustand",
  remotes: {
    reactRemote: "reactRemote@http://localhost:5001/mf-manifest.json",
    vueRemote: "vueRemote@http://localhost:5002/mf-manifest.json",
  },
  shared: {
    react: { singleton: true, requiredVersion: "^19.0.0", eager: true },
    "react-dom": { singleton: true, requiredVersion: "^19.0.0", eager: true },
  },
});

export default config;
