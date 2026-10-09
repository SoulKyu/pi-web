"use client";

import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, RefObject } from "react";
import { useI18n } from "@/hooks/useI18n";
import { promptChipsOf } from "@/lib/agents/prompt-chips";
import { encodeFilePathForApi, joinFilePath } from "@/lib/file-paths";
import { uploadFiles } from "@/lib/file-upload-client";
import type { ChatInputHandle } from "../ChatInput";

const MAX_PROMPT_CHARS = 16 * 1024;

const chipStyle = {
  padding: "2px 10px",
  fontSize: 12,
  borderRadius: 999,
  border: "1px solid var(--border)",
  background: "var(--bg-panel)",
  color: "var(--text)",
  cursor: "pointer",
} as const;

export function PromptChips({ home, chatInputRef, onNotice }: {
  home: string;
  chatInputRef: RefObject<ChatInputHandle | null>;
  onNotice?: (message: string) => void;
}) {
  const { t } = useI18n();
  const dir = joinFilePath(home, "prompts");
  const [names, setNames] = useState<string[] | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    setNames(null);
    fetch(`/api/files/${encodeFilePathForApi(dir)}?type=list`)
      .then((res) => {
        if (res.status === 404) return { entries: [] };
        return res.ok ? res.json() : Promise.reject(new Error(String(res.status)));
      })
      .then((data: { entries: Array<{ name: string; isDir: boolean }> }) => { if (!cancelled) setNames(promptChipsOf(data.entries)); })
      .catch((error) => { console.warn("prompt chips", error); if (!cancelled) setNames([]); });
    return () => { cancelled = true; };
  }, [dir, reloadKey]);

  // The + chip: .md files go into <home>/prompts (an existing name is skipped, never overwritten).
  const handleUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []).filter((file) => file.name.toLowerCase().endsWith(".md"));
    event.target.value = "";
    if (!files.length) return;
    setUploading(true);
    uploadFiles(dir, files, "skip")
      .then(({ status, data }) => {
        const failed = status >= 400 ? [data.error ?? String(status)] : (data.errors ?? []).map((item) => `${item.name}: ${item.error}`);
        if (failed.length) onNotice?.(t("agents.prompts.uploadFailed", { error: failed.join(", ") }));
      })
      .catch((error) => onNotice?.(t("agents.prompts.uploadFailed", { error: error instanceof Error ? error.message : String(error) })))
      .finally(() => {
        setUploading(false);
        setReloadKey((key) => key + 1);
      });
  };

  const insert = (name: string) => {
    setLoading(name);
    fetch(`/api/files/${encodeFilePathForApi(joinFilePath(dir, `${name}.md`))}?type=read`)
      .then((res) => res.ok ? res.json() : Promise.reject(new Error(String(res.status))))
      .then((data: { content: string }) => chatInputRef.current?.insertText(data.content.slice(0, MAX_PROMPT_CHARS)))
      .catch((error) => console.warn("prompt chip", error))
      .finally(() => setLoading(null));
  };

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "4px 12px" }}>
      {(names ?? []).map((name) => (
        <button key={name} type="button" disabled={loading === name} onClick={() => insert(name)} style={chipStyle}>{name}</button>
      ))}
      <button
        type="button"
        aria-label={t("agents.prompts.add")}
        title={t("agents.prompts.hint", { dir })}
        disabled={uploading}
        onClick={() => uploadInputRef.current?.click()}
        style={chipStyle}
      >+</button>
      <input ref={uploadInputRef} type="file" accept=".md,text/markdown" multiple hidden onChange={handleUpload} />
    </div>
  );
}
