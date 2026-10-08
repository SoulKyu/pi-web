import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap font-medium outline-none transition-[box-shadow,color,background-color,border-color] duration-150 focus-visible:shadow-glow-cyan disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-tron-orange text-black hover:shadow-glow-orange",
        outline: "border border-tron-line text-text hover:border-tron-cyan hover:text-tron-cyan",
        ghost: "text-text-muted hover:bg-bg-hover hover:text-text",
        danger: "border border-tron-red/60 text-tron-red hover:bg-tron-red/10",
      },
      size: {
        sm: "h-8 px-3 text-xs pointer-coarse:h-11",
        md: "h-9 px-4 text-sm pointer-coarse:h-11",
        icon: "size-9 pointer-coarse:size-11",
      },
    },
    defaultVariants: { variant: "outline", size: "md" },
  },
);

type ButtonProps = ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean };

export function Button({ className, variant, size, asChild = false, type, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      data-slot="button"
      type={asChild ? undefined : (type ?? "button")}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
