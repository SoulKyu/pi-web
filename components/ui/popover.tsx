"use client";

import { Popover as PopoverPrimitive } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;

export function PopoverContent({ className, sideOffset = 6, align = "center", ...props }: ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        sideOffset={sideOffset}
        align={align}
        className={cn("z-50 w-72 border border-tron-line bg-black/95 p-3 text-sm text-text shadow-glow-cyan outline-none data-[state=open]:animate-tron-enter motion-reduce:animate-none", className)}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}
