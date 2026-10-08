import { cn } from "@/lib/cn";

const STATUS = {
  running: "bg-tron-orange shadow-[0_0_8px_var(--color-tron-orange)] animate-pulse motion-reduce:animate-none",
  done: "bg-tron-cyan shadow-[0_0_8px_var(--color-tron-cyan)]",
  idle: "bg-[#24414c]",
  error: "bg-tron-red shadow-[0_0_8px_var(--color-tron-red)]",
} as const;

export type LedStatus = keyof typeof STATUS;

export function Led({ status, label, className }: { status: LedStatus; label?: string; className?: string }) {
  return (
    <span
      data-status={status}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
      className={cn("inline-block size-1.5 shrink-0 rounded-full", STATUS[status], className)}
    />
  );
}
