import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export const fieldClass = "w-full min-w-0 border border-tron-line bg-black px-3 text-sm text-text outline-none transition-shadow placeholder:text-text-dim focus-visible:border-tron-cyan focus-visible:shadow-glow-cyan aria-invalid:border-tron-red disabled:opacity-40";

export function Input({ className, type = "text", ...props }: ComponentProps<"input">) {
  return <input data-slot="input" type={type} className={cn(fieldClass, "h-9 pointer-coarse:h-11", className)} {...props} />;
}
