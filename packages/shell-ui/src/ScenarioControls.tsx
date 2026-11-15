import { useState } from "react";
import { MockApiControls } from "@poc/test-support";

type Props = {
  forceCleanupFail: boolean;
  onForceCleanupFailChange: (enabled: boolean) => void;
  onEvent: (type: string, detail?: unknown) => void;
};

const controls = new MockApiControls();

export function ScenarioControls({ forceCleanupFail, onForceCleanupFailChange, onEvent }: Props) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const run = async (label: string, action: () => Promise<void>) => {
    setBusy(true);
    setMessage(null);
    try {
      await action();
      setMessage(`${label}: ok`);
      onEvent("scenario.ok", { label });
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      setMessage(`${label}: ${text}`);
      onEvent("scenario.error", { label, error: text });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label="Scenario controls" style={{ border: "1px solid #cbd5e1", padding: 12, borderRadius: 8 }}>
      <h2>Scenario controls (fictional mock-api)</h2>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <button
          type="button"
          data-testid="delay-orders"
          disabled={busy}
          onClick={() => run("delay orders 2500ms", () => controls.delay(2500))}
        >
          Delay REST orders 2.5s
        </button>
        <button
          type="button"
          data-testid="delay-graphql"
          disabled={busy}
          onClick={() => run("delay graphql 2500ms", () => controls.delay(2500))}
        >
          Delay GraphQL 2.5s
        </button>
        <button
          type="button"
          data-testid="fail-next-orders"
          disabled={busy}
          onClick={() => run("fail next orders", () => controls.failNext("/api/orders", 500))}
        >
          Fail next /api/orders
        </button>
        <button
          type="button"
          data-testid="reset-controls"
          disabled={busy}
          onClick={() => run("reset controls", () => controls.reset())}
        >
          Reset mock controls
        </button>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <input
            type="checkbox"
            data-testid="force-cleanup-fail"
            checked={forceCleanupFail}
            onChange={(event) => {
              onForceCleanupFailChange(event.target.checked);
              onEvent("scenario.force_cleanup_fail", { enabled: event.target.checked });
            }}
          />
          Force remote cleanup failure on next remount
        </label>
      </div>
      {message ? <p data-testid="scenario-message">{message}</p> : null}
    </section>
  );
}
