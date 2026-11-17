import type { ComponentProps } from "react";
import { cn } from "../lib/utils";

export function NavLink({
  className,
  active,
  type = "button",
  ...props
}: ComponentProps<"button"> & { active?: boolean }) {
  return (
    <button
      type={type}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex h-8 items-center rounded-md px-3 text-sm font-medium transition-colors outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50",
        active ? "bg-accent text-accent-foreground" : "text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}
