"use client";

import { DropdownMenu as MenuPrimitive } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export const DropdownMenu = MenuPrimitive.Root;
export const DropdownMenuTrigger = MenuPrimitive.Trigger;

export function DropdownMenuContent({ className, sideOffset = 4, ...props }: ComponentProps<typeof MenuPrimitive.Content>) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Content
        sideOffset={sideOffset}
        className={cn("z-50 min-w-44 border border-tron-line bg-black/95 p-1 text-sm text-text shadow-glow-cyan data-[state=open]:animate-tron-enter motion-reduce:animate-none", className)}
        {...props}
      />
    </MenuPrimitive.Portal>
  );
}

export function DropdownMenuItem({ className, ...props }: ComponentProps<typeof MenuPrimitive.Item>) {
  return (
    <MenuPrimitive.Item
      className={cn("flex min-h-8 cursor-default select-none items-center gap-2 px-2 text-text-muted outline-none data-[disabled]:opacity-40 data-[highlighted]:bg-[linear-gradient(90deg,rgb(0_216_255/0.15),transparent)] data-[highlighted]:text-white data-[highlighted]:shadow-[inset_2px_0_0_var(--color-tron-cyan)] pointer-coarse:min-h-11 [&_svg]:size-4", className)}
      {...props}
    />
  );
}

export function DropdownMenuLabel({ className, ...props }: ComponentProps<typeof MenuPrimitive.Label>) {
  return <MenuPrimitive.Label className={cn("px-2 py-1.5 font-hud text-[9px] uppercase tracking-[0.14em] text-text-dim", className)} {...props} />;
}

export function DropdownMenuSeparator({ className, ...props }: ComponentProps<typeof MenuPrimitive.Separator>) {
  return <MenuPrimitive.Separator className={cn("my-1 h-px bg-tron-line", className)} {...props} />;
}
