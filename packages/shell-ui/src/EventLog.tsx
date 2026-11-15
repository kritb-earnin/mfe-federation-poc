import type { ShellEvent } from "./types";

const MAX_EVENTS = 40;

type Props = {
  events: ShellEvent[];
  onClear: () => void;
};

export function EventLog({ events, onClear }: Props) {
  return (
    <section aria-label="Event log" style={{ border: "1px solid #cbd5e1", padding: 12, borderRadius: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2>Event / debug log (bounded)</h2>
        <button type="button" data-testid="clear-events" onClick={onClear}>
          Clear
        </button>
      </div>
      <ol data-testid="event-log" style={{ margin: 0, paddingLeft: 18, maxHeight: 220, overflow: "auto" }}>
        {events.length === 0 ? <li>No events yet.</li> : null}
        {events.map((event) => (
          <li key={event.id}>
            <code>{event.at}</code> · <strong>{event.type}</strong>
            {event.detail !== undefined ? <> — {safeDetail(event.detail)}</> : null}
          </li>
        ))}
      </ol>
      <p style={{ color: "#64748b", fontSize: 12 }}>Keeps the newest {MAX_EVENTS} entries. Never logs credentials.</p>
    </section>
  );
}

export function appendEvent(events: ShellEvent[], type: string, detail?: unknown): ShellEvent[] {
  const next: ShellEvent = {
    id: (events.at(-1)?.id ?? 0) + 1,
    at: new Date().toISOString(),
    type,
    detail,
  };
  return [...events, next].slice(-MAX_EVENTS);
}

function safeDetail(detail: unknown): string {
  try {
    return JSON.stringify(detail);
  } catch {
    return String(detail);
  }
}
