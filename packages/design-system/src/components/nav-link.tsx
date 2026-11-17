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
        "box-border inline-flex h-8 cursor-pointer items-center rounded-md border-0 bg-transparent px-3 [font-family:inherit] text-sm font-medium transition-colors outline-hidden hover:bg-accent hover:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50",
        active ? "bg-accent text-accent-foreground" : "text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}
