import { cn } from "@/lib/cn";

export function Gauge({ value, label, size = 22, className }: { value: number; label: string; size?: number; className?: string }) {
  const pct = Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
  const rounded = Math.round(pct);
  const tone = pct >= 90 ? "var(--color-tron-red)" : pct >= 75 ? "var(--color-tron-orange)" : "var(--color-tron-cyan)";
  return (
    <span
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={rounded}
      className={cn("inline-grid shrink-0 place-items-center rounded-full", className)}
      style={{ width: size, height: size, background: `conic-gradient(${tone} 0 ${rounded}%, var(--color-tron-line) ${rounded}% 100%)` }}
    >
      <span className="rounded-full bg-black" style={{ width: size - 6, height: size - 6 }} />
    </span>
  );
}
