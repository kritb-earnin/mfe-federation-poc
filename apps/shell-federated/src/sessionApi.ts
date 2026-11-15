import type { SessionApi } from "@poc/platform-contracts";

let hosted: SessionApi | undefined;

/** Host installs the shell-owned SessionApi before remotes mount. */
export function setHostSessionApi(api: SessionApi): void {
  hosted = api;
}

/** Federated accessor — returns the same shell-owned SessionApi instance. */
export function getSessionApi(): SessionApi {
  if (!hosted) throw new Error("shell_federated session API is not ready");
  return hosted;
}
