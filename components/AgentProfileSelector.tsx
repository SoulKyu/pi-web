"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/hooks/useI18n";

interface ProfileOption {
  name: string;
  displayName: string;
  description: string;
}

interface Props {
  cwd?: string;
  agentProfile: string | null;
  /** Present only while the session can still pick its agent (a new, unsent session). */
  onChange?: (profile: string | null) => void;
  disabled?: boolean;
  isMobile?: boolean;
  showLabel?: boolean;
}

/** Enabled profiles, one per name: the API lists shadowed sources too, highest precedence last. */
function uniqueEnabledProfiles(profiles: Array<ProfileOption & { enabled?: boolean }>): ProfileOption[] {
  const byName = new Map<string, ProfileOption & { enabled?: boolean }>();
  for (const profile of profiles) byName.set(profile.name.toLowerCase(), profile);
  return [...byName.values()]
    .filter((profile) => profile.enabled !== false)
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export function AgentProfileSelector({ cwd, agentProfile, onChange, disabled, isMobile, showLabel = true }: Props) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [profiles, setProfiles] = useState<ProfileOption[] | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const editable = Boolean(onChange) && !disabled;

  useEffect(() => {
    if (!open || !cwd) return;
    const controller = new AbortController();
    void fetch(`/api/subagents/profiles?cwd=${encodeURIComponent(cwd)}`, { cache: "no-store", signal: controller.signal })
      .then((response) => response.ok ? response.json() : { profiles: [] })
      .then((body: { profiles?: Array<ProfileOption & { enabled?: boolean }> }) => setProfiles(uniqueEnabledProfiles(body.profiles ?? [])))
      .catch(() => { if (!controller.signal.aborted) setProfiles([]); });
    return () => controller.abort();
  }, [open, cwd]);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!profiles || !needle) return profiles ?? [];
    return profiles.filter((profile) =>
      profile.name.toLowerCase().includes(needle)
      || profile.displayName.toLowerCase().includes(needle)
      || profile.description.toLowerCase().includes(needle));
  }, [profiles, query]);

  // A session without a profile that can no longer pick one has nothing to show.
  if (!agentProfile && !editable) return null;

  const label = agentProfile ?? t("chat.defaultAgent");
  const select = (profile: string | null) => {
    setOpen(false);
    setQuery("");
    if (profile !== agentProfile) onChange?.(profile);
  };
  const rowStyle = (active: boolean) => ({
    display: "flex", flexDirection: "column" as const, alignItems: "flex-start", gap: 2,
    width: "100%", padding: "7px 12px",
    background: active ? "var(--bg-selected)" : "none",
    border: "none",
    color: active ? "var(--text)" : "var(--text-muted)",
    cursor: "pointer", fontSize: 12, textAlign: "left" as const,
    fontWeight: active ? 600 : 400,
  });

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <button
        onClick={() => editable && setOpen((value) => !value)}
        disabled={!editable}
        title={editable ? `${t("chat.changeAgentProfile")}: ${label}` : t("chat.agentProfileFixed")}
        aria-label={t("chat.agentProfile")}
        style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
          padding: isMobile ? "0 6px" : "8px 12px",
          height: 32,
          background: open ? "var(--bg-hover)" : "none",
          border: "none",
          borderRadius: 9,
          color: agentProfile ? "var(--accent)" : "var(--text-muted)",
          cursor: editable ? "pointer" : "default",
          fontSize: 12,
        }}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
        </svg>
        {showLabel && <span style={{ whiteSpace: "nowrap", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>}
      </button>
      {open && (
        <div style={{
          position: "absolute",
          bottom: "calc(100% + 6px)",
          right: isMobile ? undefined : 0,
          left: isMobile ? 0 : undefined,
          zIndex: 100, background: "var(--bg)", border: "1px solid var(--border)",
          borderRadius: 8, boxShadow: "0 -4px 16px rgba(0,0,0,0.10)",
          width: isMobile ? "min(320px, calc(100vw - 32px))" : 320,
          display: "flex", flexDirection: "column",
        }}>
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") { event.stopPropagation(); setOpen(false); }
              if (event.key === "Enter" && filtered.length > 0) select(filtered[0].name);
            }}
            placeholder={t("chat.searchAgents")}
            aria-label={t("chat.searchAgents")}
            style={{
              margin: 8, padding: "6px 8px", fontSize: 12,
              background: "var(--bg-panel)", color: "var(--text)",
              border: "1px solid var(--border)", borderRadius: 6, outline: "none",
            }}
          />
          <div style={{ maxHeight: 320, overflowY: "auto" }}>
            {!query.trim() && (
              <button onClick={() => select(null)} style={rowStyle(agentProfile === null)}>
                {t("chat.defaultAgent")}
              </button>
            )}
            {filtered.map((profile) => (
              <button
                key={profile.name}
                onClick={() => select(profile.name)}
                title={profile.description}
                style={rowStyle(agentProfile === profile.name)}
              >
                <span>{profile.displayName}</span>
                <span style={{
                  fontSize: 11, color: "var(--text-dim)", fontWeight: 400,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", width: "100%",
                }}>
                  {profile.description}
                </span>
              </button>
            ))}
            {profiles && filtered.length === 0 && (
              <div style={{ padding: "7px 12px", fontSize: 12, color: "var(--text-dim)" }}>{t("chat.noAgentsFound")}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
