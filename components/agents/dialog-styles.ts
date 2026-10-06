import type { CSSProperties } from "react";

export const fieldStyle: CSSProperties = {
  width: "100%", boxSizing: "border-box", padding: "6px 10px", border: "1px solid var(--border)", borderRadius: 6,
  outline: "none", background: "var(--bg-panel)", color: "var(--text)", fontFamily: "var(--font-mono)", fontSize: 12,
};
export const buttonStyle: CSSProperties = { padding: "6px 16px", borderRadius: 6, fontSize: 13 };
export const backdropStyle: CSSProperties = { position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: "rgba(0,0,0,0.35)" };
export const formStyle: CSSProperties = { width: "min(480px, 100%)", display: "grid", gap: 10, padding: 16, background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 10, boxShadow: "0 8px 32px rgba(0,0,0,0.18)", maxHeight: "100%", overflowY: "auto" };
export const labelStyle: CSSProperties = { display: "grid", gap: 4, fontSize: 12, color: "var(--text-muted)" };
