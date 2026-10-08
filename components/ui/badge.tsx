import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

const badgeVariants = cva("inline-flex items-center gap-1.5 border px-1.5 py-0.5 font-hud text-[9px] uppercase tracking-[0.14em]", {
  variants: {
    tone: {
      cyan: "border-tron-cyan/50 text-tron-cyan",
      orange: "border-tron-orange/60 text-tron-orange",
      red: "border-tron-red/60 text-tron-red",
      muted: "border-tron-line text-text-dim",
    },
  },
  defaultVariants: { tone: "muted" },
});

export function Badge({ className, tone, ...props }: ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
