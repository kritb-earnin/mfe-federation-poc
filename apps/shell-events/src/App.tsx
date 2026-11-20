import "./styles.css";
import { useEffect, useMemo } from "react";
import { createEventBroker } from "@poc/event-broker";
import { createSessionCoordinator } from "@poc/session-coordinator";
import { ShellApp, createMockAuthBridge } from "@poc/shell-ui";

// Module-level: shell-ui's runtime memo depends on a stable reference.
const extraRemotes = [
  {
    id: "events" as const,
    title: "Signals remote (events)",
    route: "/events",
    load: () => import("eventsRemote/mount"),
  },
];

export default function App() {
  const { api, registry, broker } = useMemo(() => {
    const { api, registry } = createSessionCoordinator({
      auth: createMockAuthBridge("user_ava"),
    });
    return { api, registry, broker: createEventBroker({ session: api }) };
  }, []);

  useEffect(() => () => broker.dispose(), [broker]);

  return (
    <ShellApp
      diMode="D"
      title="Shell Events — DI A + event channel"
      session={api}
      registry={registry}
      events={broker}
      extraRemotes={extraRemotes}
      resolveRemoteCapabilities={({ forceCleanupFail, onEvent }) => ({
        session: api,
        forceCleanupFail,
        onEvent,
      })}
      loadReactMount={() => import("reactRemote/mount")}
      loadVueMount={() => import("vueRemote/mount")}
    />
  );
}
