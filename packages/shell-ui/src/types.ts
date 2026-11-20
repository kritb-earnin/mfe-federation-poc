import type { MountHandle, RemoteMount, SessionApi } from "@poc/platform-contracts";
import type { RemoteRegistry } from "@poc/session-coordinator";
import type { EventBroker } from "@poc/event-broker";

export type DiMode = "A" | "B" | "C" | "D";

export type ShellEvent = {
  id: number;
  at: string;
  type: string;
  detail?: unknown;
};

export type RemoteSlotId = "react" | "vue" | "events";

export type RemoteLoader = () => Promise<{ default?: RemoteMount; mount?: RemoteMount }>;

export type ShellUiProps = {
  diMode: DiMode;
  title: string;
  banner?: string;
  session: SessionApi;
  registry: RemoteRegistry;
  /** Resolve SessionApi for remotes — A passes session directly; B/C may pass resolveSession. */
  resolveRemoteCapabilities: (opts: {
    forceCleanupFail: boolean;
    onEvent: (event: { type: string; detail?: unknown }) => void;
  }) => {
    session?: SessionApi;
    resolveSession?: () => SessionApi;
    forceCleanupFail?: boolean;
    onEvent?: (event: { type: string; detail?: unknown }) => void;
  };
  loadReactMount: RemoteLoader;
  loadVueMount: RemoteLoader;
  /** Optional shell-owned event broker (shell D); remotes only get `events.forRemote(id)` */
  events?: EventBroker;
  /** Additional remotes beyond react and vue */
  extraRemotes?: { id: RemoteSlotId; title: string; route: string; load: RemoteLoader }[];
};

export type MountedRemote = {
  id: RemoteSlotId;
  handle: MountHandle;
};
