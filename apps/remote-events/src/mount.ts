// Remote CSS ships with the ./mount expose, so the shell loads it when it loads mount.
import "./styles.css";
import type { MountCapabilities, MountHandle, RemoteMount } from "@poc/platform-contracts";
import { createView } from "./view.js";

export const mount: RemoteMount = (element: HTMLElement, capabilities: MountCapabilities): MountHandle => {
  const view = createView(element, capabilities);
  return {
    lifecycle: {
      async prepareTransition() {},
      resetIdentityState: () => view.resetIdentityState(),
      async resume() {
        view.resume();
      },
      block: (reason) => view.block(`Blocked: ${reason.message}`),
      dispose: () => view.dispose(),
    },
    unmount: () => view.dispose(),
  };
};
