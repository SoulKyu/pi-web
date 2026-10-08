import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export const composerMenuClass = "z-[100] overflow-hidden border border-tron-line bg-black shadow-glow-cyan";

const TONES = {
  default: "text-text-muted enabled:hover:text-text",
  danger: "text-tron-red enabled:hover:bg-tron-red/15",
  accent: "text-tron-cyan enabled:hover:text-tron-cyan",
} as const;

type ComposerChipProps = ComponentProps<"button"> & { active?: boolean; tone?: keyof typeof TONES; iconOnly?: boolean };

export function ComposerChip({ active = false, tone = "default", iconOnly = false, className, type, ...props }: ComposerChipProps) {
  return (
    <button
      type={type ?? "button"}
      className={cn(
        "flex h-8 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap bg-transparent font-mono text-xs outline-none transition-colors enabled:hover:bg-bg-hover focus-visible:shadow-glow-cyan disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:size-3 [&_svg]:shrink-0",
        iconOnly ? "w-8 p-0" : "px-3",
        active && "bg-bg-hover",
        TONES[tone],
        className,
      )}
      {...props}
    />
  );
}
