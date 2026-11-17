import type { ComponentProps } from "react";
import { cn } from "../lib/utils";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "box-border h-9 w-full min-w-0 rounded-md border border-solid border-input bg-background px-3 py-1 [font-family:inherit] text-sm text-foreground shadow-xs outline-hidden placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
