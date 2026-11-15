import type { RemoteLifecycle } from "@poc/platform-contracts";

export interface RemoteRegistry {
  register(id: string, lifecycle: RemoteLifecycle): void;
  unregister(id: string): void;
}

export function createRemoteRegistry() {
  const remotes = new Map<string, RemoteLifecycle>();
  const blocked = new Set<string>();
  const registry: RemoteRegistry = {
    register(id, lifecycle) {
      remotes.set(id, lifecycle);
      blocked.delete(id);
    },
    unregister(id) {
      remotes.delete(id);
      blocked.delete(id);
    },
  };
  return { registry, remotes, blocked };
}
