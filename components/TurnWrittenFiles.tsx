"use client";

import { Fragment, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { encodeFilePathForApi, getFileName } from "@/lib/file-paths";
import type { WrittenFile } from "@/lib/turn-written-files";
import { getFileIcon } from "./FileIcons";
import { MarkdownBody } from "./MarkdownBody";

const PREVIEW_MAX_LINES = 20;
const PREVIEW_MAX_CHARS = 8192;

export function isPreviewable(filePath: string, root?: string): boolean {
  return Boolean(root) && filePath.endsWith(".md") && filePath.startsWith(`${root}/`);
}

/** The route has no byte cap parameter, so the cut happens here. */
export function clipPreview(text: string): string {
  return text.split("\n").slice(0, PREVIEW_MAX_LINES).join("\n").slice(0, PREVIEW_MAX_CHARS);
}

function MarkdownPreview({ filePath, root }: { filePath: string; root: string }) {
  const { t } = useI18n();
  const [state, setState] = useState<{ status: "idle" } | { status: "loading" } | { status: "error" } | { status: "ready"; text: string }>({ status: "idle" });

  const load = () => {
    if (state.status !== "idle") return;
    setState({ status: "loading" });
    fetch(`/api/files/${encodeFilePathForApi(filePath)}?type=read`)
      .then((res) => res.ok ? res.json() : Promise.reject(new Error(String(res.status))))
      .then((data: { content: string }) => setState({ status: "ready", text: clipPreview(data.content) }))
      .catch(() => setState({ status: "error" }));
  };

  return (
    <details onToggle={(event) => { if (event.currentTarget.open) load(); }} style={{ flexBasis: "100%", fontSize: 12 }}>
      <summary style={{ cursor: "pointer", color: "var(--text-muted)" }}>{t("chat.previewMarkdown")}</summary>
      {state.status === "loading" && <div style={{ color: "var(--text-muted)" }}>{t("chat.previewLoading")}</div>}
      {state.status === "error" && <div style={{ color: "var(--text-muted)" }}>{t("chat.previewError")}</div>}
      {state.status === "ready" && <MarkdownBody cwd={root}>{state.text}</MarkdownBody>}
    </details>
  );
}

/**
 * Lists the files a turn actually wrote, as buttons that open each one in the
 * preview pane. Entries come from the turn's successful `write`/`edit` tool
 * calls — the reply text is never scanned for paths.
 */
export function TurnWrittenFiles({ files, previewRoot, onOpenFile }: {
  files: WrittenFile[];
  previewRoot?: string;
  onOpenFile?: (filePath: string) => void;
}) {
  const { t } = useI18n();
  if (files.length === 0) return null;

  return (
    <div aria-label={t("chat.filesWritten")} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, marginTop: 6 }}>
      {files.map(({ filePath }) => {
        const name = getFileName(filePath);
        return (
          <Fragment key={filePath}>
          <button
            type="button"
            title={filePath}
            aria-label={t("chat.openWrittenFile", { name })}
            onClick={() => onOpenFile?.(filePath)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "2px 8px",
              fontSize: 12,
              fontFamily: "var(--font-mono)",
              color: "var(--text)",
              background: "var(--bg-subtle)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            {getFileIcon(name, 12)}
            <span>{name}</span>
          </button>
          {previewRoot && isPreviewable(filePath, previewRoot) && <MarkdownPreview filePath={filePath} root={previewRoot} />}
          </Fragment>
        );
      })}
    </div>
  );
}
