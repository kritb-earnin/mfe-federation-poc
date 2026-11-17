import { cn } from "@poc/design-system/utils";

/** Fall-through attrs with `class` merged via twMerge, so overrides win like React `cn()`. */
export function mergeAttrs(attrs: Record<string, unknown>, base: string): Record<string, unknown> {
  const { class: cls, ...rest } = attrs;
  return { ...rest, class: cn(base, cls as never) };
}
