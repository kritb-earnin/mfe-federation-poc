import type { ComponentProps } from "react";
import { cn } from "../lib/utils";

/** Styled native <select>; no portal, so e2e `selectOption` keeps working. */
export function NativeSelect({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "box-border h-9 rounded-md border border-solid border-input bg-background py-1 pr-8 pl-3 [font-family:inherit] text-sm text-foreground shadow-xs outline-hidden focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
