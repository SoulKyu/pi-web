import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

const TONES = {
  default: "text-text-muted enabled:hover:text-text",
  danger: "text-tron-red",
  success: "text-tron-cyan",
  warning: "text-tron-orange",
} as const;

const EDGES = { right: "border-r border-tron-line", left: "border-l border-tron-line", none: "" } as const;

type TopBarButtonProps = ComponentProps<"button"> & {
  active?: boolean;
  tone?: keyof typeof TONES;
  iconOnly?: boolean;
  edge?: keyof typeof EDGES;
};

export function TopBarButton({ active = false, tone = "default", iconOnly = false, edge = "right", className, type, ...props }: TopBarButtonProps) {
  return (
    <button
      type={type ?? "button"}
      className={cn(
        "flex h-full shrink-0 items-center justify-center gap-1.5 whitespace-nowrap bg-transparent text-[11px] outline-none transition-[color,background-color,box-shadow] duration-100 enabled:hover:bg-bg-hover focus-visible:shadow-glow-cyan disabled:cursor-not-allowed disabled:opacity-45 [&_svg]:size-3.5 [&_svg]:shrink-0",
        iconOnly ? "aspect-square p-0" : "px-3",
        TONES[tone],
        EDGES[edge],
        active && "bg-bg-selected text-white shadow-[inset_0_-2px_0_var(--color-tron-cyan)] focus-visible:shadow-[inset_0_-2px_0_var(--color-tron-cyan),var(--shadow-glow-cyan)]",
        className,
      )}
      {...props}
    />
  );
}

export function contextTone(percent: number | null): "cyan" | "orange" | "red" {
  if (percent === null) return "cyan";
  if (percent >= 90) return "red";
  if (percent >= 75) return "orange";
  return "cyan";
}
