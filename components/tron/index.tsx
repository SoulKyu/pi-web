import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/cn";

export function PerspectiveGrid({ className }: { className?: string }) {
  return <div aria-hidden className={cn("tron-grid pointer-events-none absolute inset-x-[-30%] bottom-[-14%] h-[42%]", className)} />;
}

export function ScanBar({ className }: { className?: string }) {
  return <span aria-hidden className={cn("tron-scan block h-px w-full", className)} />;
}

export function StreamCursor() {
  return <span aria-hidden className="tron-cursor" />;
}

const segmenter = typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null;

function initials(label: string): string {
  const trimmed = label.trim();
  const graphemes = segmenter ? Array.from(segmenter.segment(trimmed), (part) => part.segment) : Array.from(trimmed);
  const letters = graphemes.slice(0, 2).join("");
  return letters ? letters.toUpperCase() : "?";
}

type HexAvatarProps = { label: string; active?: boolean; color?: string; size?: number; className?: string; children?: ReactNode };

export function HexAvatar({ label, active = false, color, size = 28, className, children }: HexAvatarProps) {
  return (
    <span
      aria-hidden
      className={cn("tron-hex grid shrink-0 place-items-center p-px", active && "bg-tron-cyan", className)}
      style={{ width: size, height: size, ...(active ? {} : { background: color ?? "var(--color-tron-line)" }) }}
    >
      <span className={cn("tron-hex grid size-full place-items-center font-hud text-[9px]", active ? "bg-[#00303a] text-white" : "bg-black text-tron-cyan")}>
        {children ?? initials(label)}
      </span>
    </span>
  );
}

const GLOW = {
  cyan: "drop-shadow-[0_0_6px_rgb(0_216_255/0.45)]",
  orange: "drop-shadow-[0_0_6px_rgb(255_154_0/0.5)]",
} as const;

type ChamferProps = {
  tone?: keyof typeof GLOW;
  glow?: boolean;
  cut?: number;
  className?: string;
  innerClassName?: string;
  children: ReactNode;
};

export function Chamfer({ tone = "cyan", glow = false, cut = 12, className, innerClassName, children }: ChamferProps) {
  return (
    <div className={cn(glow && GLOW[tone], className)}>
      <div className={cn("tron-chamfer p-px", tone === "cyan" ? "bg-tron-cyan" : "bg-tron-orange")} style={{ "--cut": `${cut}px` } as CSSProperties}>
        <div className={cn("tron-chamfer bg-black", innerClassName)} style={{ "--cut": `${cut - 1}px` } as CSSProperties}>
          {children}
        </div>
      </div>
    </div>
  );
}
