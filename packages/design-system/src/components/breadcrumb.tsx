import type { ComponentProps } from "react";
import { cn } from "../lib/utils";

export function Breadcrumb({ className, ...props }: ComponentProps<"ol">) {
  return (
    <nav aria-label="breadcrumb">
      <ol
        className={cn("flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground", className)}
        {...props}
      />
    </nav>
  );
}

/** The "/" separator is drawn by CSS, so it is not part of the text content. */
export function BreadcrumbItem({ className, ...props }: ComponentProps<"li">) {
  return (
    <li
      className={cn(
        "inline-flex items-center gap-1.5 not-first:before:content-['/'] not-first:before:text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}
