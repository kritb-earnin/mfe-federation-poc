import { createStore } from "zustand/vanilla";
import {
  ShellCommandError,
  assertLanguage,
  assertPath,
  type Language,
  type LayoutSpec,
  type RemoteLifecycle,
  type SessionApi,
  type ShellApi,
  type ShellState,
  type ShellUser,
  type SlotId,
} from "@poc/platform-contracts";

export type ShellView = { activeRemoteId: string | null; layout: LayoutSpec | null };

export type ShellRuntimeOptions = {
  session: SessionApi;
  /** path prefix -> remoteId */
  routes: Record<string, string>;
  resolveUser(subjectId: string): ShellUser | null;
  /** default "/orders" */
  initialPath?: string;
};

export interface ShellRuntime {
  getState(): Readonly<ShellState>;
  getView(): Readonly<ShellView>;
  /** Notified on any state or view change */
  subscribe(onChange: () => void): () => void;
  forRemote(remoteId: string): ShellApi;
  registerRemote(remoteId: string, lifecycle: RemoteLifecycle): RemoteLifecycle;
  unregisterRemote(remoteId: string): void;
  attachSlotElement(id: SlotId, el: HTMLElement | null): void;
  /** Same validation as ShellApi.navigate, for the shell UI */
  shellNavigate(path: string): void;
  /** Same validation as ShellApi.setLanguage */
  shellSetLanguage(code: Language): void;
  dispose(): void;
}

type InternalState = { state: ShellState; view: ShellView };

/** Internal: state, navigation, language, view. Later tasks layer remotes, layout and slots on top. */
export function createShellCore(options: ShellRuntimeOptions) {
  const { session, routes, resolveUser } = options;
  const prefixes = Object.keys(routes).sort((a, b) => b.length - a.length);
  const matchRoute = (path: string) =>
    prefixes.find((prefix) => path === prefix || path.startsWith(`${prefix}/`));
  const remoteIdFor = (path: string) => {
    const prefix = matchRoute(path);
    return prefix === undefined ? null : routes[prefix]!;
  };

  const userFromSession = (): ShellUser | null => {
    const snapshot = session.getSnapshot();
    return snapshot.status === "authenticated" && snapshot.subjectId !== undefined
      ? resolveUser(snapshot.subjectId)
      : null;
  };
  const sameUser = (a: ShellUser | null, b: ShellUser | null) =>
    a === b || (a !== null && b !== null && a.subjectId === b.subjectId && a.displayName === b.displayName);

  const makeView = (path: string): ShellView =>
    Object.freeze({ activeRemoteId: remoteIdFor(path), layout: null });
  const initialPath = assertPath(options.initialPath ?? "/orders");
  const makeState = (path: string, language: Language, user: ShellUser | null): ShellState =>
    Object.freeze({ path, language, user });

  const store = createStore<InternalState>(() => ({
    state: makeState(initialPath, "en", userFromSession()),
    view: makeView(initialPath),
  }));
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of [...listeners]) listener();
  };

  /** Replaces state only when a field changed, so identity is stable otherwise. */
  const patch = (next: Partial<ShellState>) => {
    const { state, view } = store.getState();
    const path = next.path ?? state.path;
    const language = next.language ?? state.language;
    const user = next.user === undefined ? state.user : next.user;
    if (path === state.path && language === state.language && sameUser(user, state.user)) return;
    store.setState({
      state: makeState(path, language, sameUser(user, state.user) ? state.user : user),
      view: path === state.path ? view : makeView(path),
    });
    notify();
  };

  const navigate = (path: string) => {
    assertPath(path);
    if (matchRoute(path) === undefined) {
      throw new ShellCommandError("INVALID_PATH", `No route for path: ${path}`);
    }
    patch({ path });
  };
  const setLanguage = (code: Language) => patch({ language: assertLanguage(code) });

  const unsubscribeSession = session.subscribe(() => patch({ user: userFromSession() }));

  return {
    getState: () => store.getState().state as Readonly<ShellState>,
    getView: () => store.getState().view as Readonly<ShellView>,
    subscribe(onChange: () => void) {
      listeners.add(onChange);
      return () => {
        listeners.delete(onChange);
      };
    },
    navigate,
    setLanguage,
    dispose() {
      unsubscribeSession();
      listeners.clear();
    },
  };
}

export function createShellRuntime(options: ShellRuntimeOptions): ShellRuntime {
  const core = createShellCore(options);
  const notImplemented = (): never => {
    throw new Error("not implemented");
  };
  return {
    getState: core.getState,
    getView: core.getView,
    subscribe: core.subscribe,
    forRemote: notImplemented,
    registerRemote: notImplemented,
    unregisterRemote: notImplemented,
    attachSlotElement: notImplemented,
    shellNavigate: notImplemented,
    shellSetLanguage: notImplemented,
    dispose: core.dispose,
  };
}
