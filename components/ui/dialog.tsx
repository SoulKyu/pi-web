"use client";

import { XIcon } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

const SIDES = {
  center: "left-1/2 top-1/2 max-h-[85dvh] w-[min(92vw,32rem)] -translate-x-1/2 -translate-y-1/2 border",
  right: "inset-y-0 right-0 h-full w-[min(92vw,26rem)] border-l",
  left: "inset-y-0 left-0 h-full w-[min(92vw,26rem)] border-r",
  bottom: "inset-x-0 bottom-0 max-h-[85dvh] border-t pb-[max(1.25rem,env(safe-area-inset-bottom))]",
} as const;

type DialogContentProps = ComponentProps<typeof DialogPrimitive.Content> & {
  side?: keyof typeof SIDES;
  closeLabel: string;
};

export function DialogContent({ className, children, side = "center", closeLabel, ...props }: DialogContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/70 data-[state=open]:animate-tron-fade motion-reduce:animate-none" />
      <DialogPrimitive.Content
        className={cn(
          "fixed z-50 flex flex-col gap-4 overflow-y-auto border-tron-line bg-tron-panel p-5 text-text shadow-glow-cyan outline-none data-[state=open]:animate-tron-enter motion-reduce:animate-none",
          SIDES[side],
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          aria-label={closeLabel}
          className="absolute right-2 top-2 grid size-9 place-items-center text-text-dim outline-none hover:text-tron-cyan focus-visible:shadow-glow-cyan pointer-coarse:size-11"
        >
          <XIcon aria-hidden className="size-4" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogHeader({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-1.5 pr-8", className)} {...props} />;
}

export function DialogFooter({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)} {...props} />;
}

export function DialogTitle({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn("font-hud text-[11px] uppercase tracking-[0.16em] text-tron-cyan", className)} {...props} />;
}

export function DialogDescription({ className, ...props }: ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn("text-sm text-text-muted", className)} {...props} />;
}
