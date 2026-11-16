import { createStore } from "zustand/vanilla";
import {
  SHELL_CONTRACT_VERSION,
  ShellCommandError,
  assertLanguage,
  assertPath,
  validateLayoutSpec,
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
type LayoutEntry = { spec: LayoutSpec };
type SlotClaim = { remoteId: string; render: (el: HTMLElement) => () => void; cleanup?: () => void; rendered: boolean };
type FacadeToken = { revoked: boolean };

/** Deep frozen copy of the known fields only, so later mutation of the caller's spec cannot reach the view. */
const freezeLayout = (spec: LayoutSpec): LayoutSpec =>
  Object.freeze({
    title: spec.title,
    breadcrumbs: spec.breadcrumbs && Object.freeze(spec.breadcrumbs.map((b) => Object.freeze({ label: b.label, path: b.path }))),
    actions:
      spec.actions &&
      Object.freeze(
        spec.actions.map((a) => Object.freeze({ id: a.id, label: a.label, disabled: a.disabled, onSelect: a.onSelect })),
      ),
  }) as LayoutSpec;

/** Internal: state, navigation, language, view, per-remote facades, layout and slots. */
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

  const layouts = new Map<string, LayoutEntry>();
  const makeView = (path: string): ShellView => {
    const activeRemoteId = remoteIdFor(path);
    const layout = (activeRemoteId === null ? undefined : layouts.get(activeRemoteId)?.spec) ?? null;
    return Object.freeze({ activeRemoteId, layout });
  };
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

  /** Rebuilds the view after a layout change; keeps identity when nothing visible changed. */
  const refreshView = () => {
    const { state, view } = store.getState();
    const next = makeView(state.path);
    if (next.activeRemoteId === view.activeRemoteId && next.layout === view.layout) return;
    store.setState({ view: next });
    notify();
  };

  const claims = new Map<SlotId, SlotClaim>();
  const elements = new Map<SlotId, HTMLElement>();
  const renderClaim = (id: SlotId) => {
    const claim = claims.get(id);
    const el = elements.get(id);
    if (!claim || !el || claim.rendered) return;
    try {
      const cleanup = claim.render(el);
      claim.cleanup = typeof cleanup === "function" ? cleanup : undefined;
      claim.rendered = true;
    } catch {
      el.replaceChildren();
      claims.delete(id);
    }
  };
  /** Runs cleanup (contained) and empties the element; the claim itself is kept. */
  const clearSlot = (id: SlotId) => {
    const claim = claims.get(id);
    if (claim?.rendered) {
      claim.rendered = false;
      try {
        claim.cleanup?.();
      } catch {
        // contained: the element is emptied below regardless
      }
      claim.cleanup = undefined;
    }
    elements.get(id)?.replaceChildren();
  };
  const releaseClaim = (id: SlotId, claim: SlotClaim) => {
    if (claims.get(id) !== claim) return;
    clearSlot(id);
    claims.delete(id);
    notify();
  };

  const attachSlotElement = (id: SlotId, el: HTMLElement | null) => {
    const previous = elements.get(id);
    if (el === (previous ?? null)) return;
    if (previous) clearSlot(id);
    if (el) elements.set(id, el);
    else elements.delete(id);
    renderClaim(id);
  };

  const facades = new Map<string, FacadeToken>();
  const revoke = (remoteId: string) => {
    const token = facades.get(remoteId);
    if (token) token.revoked = true;
    facades.delete(remoteId);
    for (const [id, claim] of claims) if (claim.remoteId === remoteId) releaseClaim(id, claim);
    if (layouts.delete(remoteId)) refreshView();
  };

  const forRemote = (remoteId: string): ShellApi => {
    if (facades.has(remoteId)) revoke(remoteId);
    const token: FacadeToken = { revoked: false };
    facades.set(remoteId, token);
    const live = () => {
      if (token.revoked) throw new ShellCommandError("FACADE_REVOKED", `Facade for ${remoteId} was revoked`);
    };
    return {
      contractVersion: SHELL_CONTRACT_VERSION,
      getState: () => store.getState().state as Readonly<ShellState>,
      subscribe: (onChange) => subscribe(onChange),
      navigate(path) {
        live();
        navigate(path);
      },
      setLanguage(code) {
        live();
        setLanguage(code);
      },
      setLayout(spec) {
        live();
        const entry: LayoutEntry = { spec: freezeLayout(validateLayoutSpec(spec)) };
        layouts.set(remoteId, entry);
        refreshView();
        return () => {
          if (layouts.get(remoteId) !== entry) return;
          layouts.delete(remoteId);
          refreshView();
        };
      },
      claimSlot(id, render) {
        live();
        if (claims.has(id)) throw new ShellCommandError("SLOT_TAKEN", `Slot ${id} is already claimed`);
        const claim: SlotClaim = { remoteId, render, rendered: false };
        claims.set(id, claim);
        renderClaim(id);
        notify();
        return () => releaseClaim(id, claim);
      },
    };
  };

  const subscribe = (onChange: () => void) => {
    listeners.add(onChange);
    return () => {
      listeners.delete(onChange);
    };
  };

  const unsubscribeSession = session.subscribe(() => patch({ user: userFromSession() }));

  return {
    getState: () => store.getState().state as Readonly<ShellState>,
    getView: () => store.getState().view as Readonly<ShellView>,
    subscribe,
    navigate,
    setLanguage,
    forRemote,
    attachSlotElement,
    /** Internal (Task 4): releases a remote's layout and slot claims and revokes its facade. */
    revoke,
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
    forRemote: core.forRemote,
    registerRemote: notImplemented,
    unregisterRemote: notImplemented,
    attachSlotElement: core.attachSlotElement,
    shellNavigate: notImplemented,
    shellSetLanguage: notImplemented,
    dispose: core.dispose,
  };
}
