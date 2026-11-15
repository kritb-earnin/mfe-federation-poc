import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import type { MountCapabilities, MountHandle, RemoteBlockReason, RemoteMount, SessionApi } from "@poc/platform-contracts";
import { App, type LocalFeatureState } from "./App.js";

function resolveSession(capabilities: MountCapabilities): SessionApi {
  const session = capabilities.session ?? capabilities.resolveSession?.();
  if (!session) throw new Error("React remote requires a session capability or resolver");
  return session;
}

export const mount: RemoteMount = (element, capabilities): MountHandle => {
  const session = resolveSession(capabilities);
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
  const unsubscribe = session.subscribe(render);
  render();

  const lifecycle = {
    async prepareTransition(_ctx: { signal: AbortSignal }): Promise<void> {
      await queryClient.cancelQueries();
    },
    async resetIdentityState(_ctx: { signal: AbortSignal }): Promise<void> {
      if (capabilities.forceCleanupFail) throw new Error("forced cleanup failure");
      queryClient.clear();
      localFeature = { draftNote: "" };
    },
    async resume(): Promise<void> {
      blocked = null;
      render();
    },
    block(reason: RemoteBlockReason): void {
      blocked = reason;
      localFeature = { draftNote: "" };
      void queryClient.cancelQueries();
      queryClient.clear();
      render();
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      unsubscribe();
      queryClient.clear();
      root.unmount();
    },
  };

  return { lifecycle, unmount: () => lifecycle.dispose() };
};

export default mount;
