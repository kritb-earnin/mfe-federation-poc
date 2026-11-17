import type { ComponentProps } from "react";
import { cn } from "../lib/utils";
import { breadcrumbClass, breadcrumbItemClass } from "../variants";

// className and data-* land on the inner <ol>, not the <nav>.
export function Breadcrumb({ className, ...props }: ComponentProps<"ol">) {
  return (
    <nav aria-label="breadcrumb">
      <ol className={cn(breadcrumbClass, className)} {...props} />
    </nav>
  );
}

/** The "/" separator is drawn by CSS, so it is not part of the text content. */
export function BreadcrumbItem({ className, ...props }: ComponentProps<"li">) {
  return <li className={cn(breadcrumbItemClass, className)} {...props} />;
}
