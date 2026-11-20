import { useEffect, useRef, useState } from "react";
import { Button, Card, CardContent, CardHeader } from "@poc/design-system";
import type { ShellRuntime } from "@poc/shell-state";
import type { EventBroker } from "@poc/event-broker";
import { mirrorShellState } from "./mirrorShellState";

const MAX = 20;

export function EventsPanel({ events, runtime }: { events: EventBroker; runtime: ShellRuntime }) {
  const [log, setLog] = useState<string[]>([]);
  const count = useRef(0);

  useEffect(() => mirrorShellState(runtime, events), [runtime, events]);
  useEffect(
    () =>
      events.observe((m) =>
        setLog((prev) => [...prev, `${m.from} ${m.topic} ${JSON.stringify(m.payload)}`].slice(-MAX)),
      ),
    [events],
  );

  return (
    <Card aria-label="Events" role="region" data-testid="events-panel">
      <CardHeader className="flex-row items-center justify-between gap-2">
        <h3 className="m-0 text-sm font-semibold">Events</h3>
        <Button
          variant="outline"
          size="sm"
          data-testid="send-notice"
          onClick={() => events.publishFromShell("shell.notice", { text: `notice ${++count.current}` })}
        >
          Send notice
        </Button>
      </CardHeader>
      <CardContent>
        <ul data-testid="events-log" className="m-0 list-none p-0 text-xs">
          {log.map((line, i) => (
            <li key={i} data-testid="events-log-item">
              {line}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
