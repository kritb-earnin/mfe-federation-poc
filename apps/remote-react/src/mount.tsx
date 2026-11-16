import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import type { LayoutSpec, MountCapabilities, MountHandle, RemoteBlockReason, RemoteMount, SessionApi } from "@poc/platform-contracts";
import { App, OpenOrdersBadge, type LocalFeatureState } from "./App.js";
import { orderIdFromPath, tryShell } from "./shellAdapter.js";
import { t } from "./i18n.js";

void React;

function resolveSession(capabilities: MountCapabilities): SessionApi {
  const session = capabilities.session ?? capabilities.resolveSession?.();
  if (!session) throw new Error("React remote requires a session capability or resolver");
  return session;
}

export const mount: RemoteMount = (element, capabilities): MountHandle => {
  const session = resolveSession(capabilities);
  const shell = capabilities.shell;
  const queryClient = new QueryClient();
  let blocked: RemoteBlockReason | null = null;
  let localFeature: LocalFeatureState = { draftNote: "" };
  let disposed = false;
  const root = createRoot(element);
  const render = () => {
    if (!disposed) {
      root.render(
        <QueryClientProvider client={queryClient}>
          <App
            session={session}
            shell={shell}
            blocked={blocked}
            localFeature={localFeature}
            setLocalFeature={(update) => {
              localFeature = typeof update === "function" ? update(localFeature) : update;
              render();
            }}
          />
        </QueryClientProvider>,
      );
    }
  };

  // Shell contributions. The shell drops layouts while transitioning and clears them on every transition,
  // so the layout is re-sent on any path, language or session change and forced in resume().
  let releaseLayout: (() => void) | undefined;
  let releaseSlot: (() => void) | undefined;
  let layoutKey = "";
  const syncLayout = (force = false) => {
    if (!shell || disposed || blocked) return;
    const { path, language } = shell.getState();
    const snapshot = session.getSnapshot();
    const key = [path, language, snapshot.status, snapshot.accountId, snapshot.contextRevision].join("|");
    if (!force && key === layoutKey) return; // setLayout notifies subscribers; the key stops the loop
    layoutKey = key;
    const orderId = orderIdFromPath(path);
    const orderLabel = orderId ? `${t(language, "Order")} ${orderId}` : undefined;
    const spec: LayoutSpec = {
      title: orderLabel ?? t(language, "Orders"),
      breadcrumbs: [{ label: t(language, "Orders"), path: "/orders" }, ...(orderLabel ? [{ label: orderLabel }] : [])],
      actions: [{ id: "refresh", label: t(language, "Refresh orders"), onSelect: () => void queryClient.invalidateQueries() }],
    };
    releaseLayout?.();
    releaseLayout = tryShell(() => shell.setLayout(spec));
  };
  const releaseShell = () => {
    tryShell(() => releaseLayout?.());
    tryShell(() => releaseSlot?.());
    releaseLayout = releaseSlot = undefined;
  };

  const unsubscribe = session.subscribe(() => {
    render();
    syncLayout();
  });
  const unsubscribeShell = shell?.subscribe(() => syncLayout());
  render();
  syncLayout();
  if (shell) {
    // SLOT_TAKEN (or a revoked facade) means we carry on without the header slot.
    releaseSlot = tryShell(() =>
      shell.claimSlot("header", (el) => {
        // Fresh root from current state each call: the shell re-renders the slot after resume.
        const slotRoot = createRoot(el);
        slotRoot.render(
          <QueryClientProvider client={queryClient}>
            <OpenOrdersBadge session={session} shell={shell} />
          </QueryClientProvider>,
        );
        return () => slotRoot.unmount();
      }),
    );
  }

  const lifecycle = {
    async prepareTransition(_ctx: { signal: AbortSignal }): Promise<void> {
      void queryClient.cancelQueries();
    },
    async resetIdentityState(_ctx: { signal: AbortSignal }): Promise<void> {
      if (capabilities.forceCleanupFail) throw new Error("forced cleanup failure");
      void queryClient.cancelQueries();
      queryClient.clear();
      localFeature = { draftNote: "" };
    },
    async resume(): Promise<void> {
      blocked = null;
      render();
      syncLayout(true);
    },
    block(reason: RemoteBlockReason): void {
      blocked = reason;
      releaseShell();
      localFeature = { draftNote: "" };
      void queryClient.cancelQueries();
      queryClient.clear();
      render();
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      unsubscribe();
      unsubscribeShell?.();
      releaseShell();
      queryClient.clear();
      root.unmount();
    },
  };

  return { lifecycle, unmount: () => lifecycle.dispose() };
};

export default mount;
