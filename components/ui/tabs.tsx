"use client";

import { Tabs as TabsPrimitive } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className={cn("flex border-b border-tron-line", className)} {...props} />;
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn("-mb-px min-h-9 border-b-2 border-transparent px-3 font-mono text-xs text-text-muted outline-none hover:text-text focus-visible:shadow-glow-cyan data-[state=active]:border-tron-cyan data-[state=active]:text-white data-[state=active]:shadow-[0_6px_10px_-8px_var(--color-tron-cyan)] pointer-coarse:min-h-11", className)}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn("outline-none", className)} {...props} />;
}
