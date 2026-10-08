import type { InlineExtension } from "@earendil-works/pi-coding-agent";

export const SECRET_REDACTION_EXTENSION_NAME = "pi-web-secret-redaction";
const MIN_REDACTED_LENGTH = 8;

/**
 * Replaces exact occurrences of each secret value (8+ characters) in text results by `[SECRET:<NAME>]`.
 * Accidental leaks only: an encoded or split value passes, and structuredContent is returned unchanged.
 * Never throws; on error the result stays as it is.
 */
export function createSecretRedactionExtension(secrets: Record<string, string>): InlineExtension {
  const entries = Object.entries(secrets).filter(([, value]) => value.length >= MIN_REDACTED_LENGTH).sort((a, b) => b[1].length - a[1].length);
  return {
    name: SECRET_REDACTION_EXTENSION_NAME,
    hidden: true,
    factory: (pi) => {
      if (entries.length === 0) return;
      pi.on("tool_result", (event) => {
        try {
          const content = event.content.map((part) => (part.type === "text"
            ? { ...part, text: entries.reduce((text, [name, value]) => text.split(value).join(`[SECRET:${name}]`), String(part.text ?? "")) }
            : part));
          return { content, structuredContent: event.structuredContent };
        } catch {
          return undefined;
        }
      });
    },
  };
}
