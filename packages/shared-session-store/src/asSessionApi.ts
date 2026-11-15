import type { SessionApi } from "@poc/platform-contracts";
type CoordinatorLike = { readonly api: SessionApi };

export function asSessionApi(coordinator: CoordinatorLike): SessionApi {
  return coordinator.api;
}
