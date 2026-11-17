import type { ComponentProps } from "react";
import { cn } from "../lib/utils";

/** `<dl>` with muted `dt` and normal `dd` children, in a two-column grid. */
export function DefinitionList({ className, ...props }: ComponentProps<"dl">) {
  return (
    <dl
      className={cn(
        "m-0 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm [&>dt]:m-0 [&>dt]:text-muted-foreground [&>dd]:m-0 [&>dd]:text-foreground",
        className,
      )}
      {...props}
    />
  );
}
