"use client";

import { Switch as SwitchPrimitive } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export function Switch({ className, ...props }: ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn("relative inline-flex h-5 w-9 shrink-0 items-center border border-tron-line bg-black outline-none transition-[background-color,box-shadow] focus-visible:shadow-glow-cyan disabled:opacity-40 data-[state=checked]:border-tron-cyan data-[state=checked]:bg-tron-cyan/15", className)}
      {...props}
    >
      <SwitchPrimitive.Thumb className="block size-3 translate-x-0.5 bg-text-dim transition-[translate,background-color] data-[state=checked]:translate-x-[18px] data-[state=checked]:bg-tron-cyan data-[state=checked]:shadow-[0_0_8px_var(--color-tron-cyan)]" />
    </SwitchPrimitive.Root>
  );
}
