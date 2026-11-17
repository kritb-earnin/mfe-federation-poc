import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/utils";

export const alertVariants = cva("relative box-border w-full rounded-lg border border-solid px-4 py-3 text-sm", {
  variants: {
    variant: {
      default: "border-border bg-card text-card-foreground",
      warning: "border-warning bg-warning/15 text-foreground",
      destructive: "border-destructive bg-destructive/10 text-destructive",
    },
  },
  defaultVariants: { variant: "default" },
});

export function Alert({
  className,
  variant,
  role,
  ...props
}: ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return (
    <div
      role={role ?? (variant === "warning" || variant === "destructive" ? "alert" : undefined)}
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  );
}
