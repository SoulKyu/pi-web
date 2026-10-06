/**
 * Strip credentials before text leaves the machine for fact extraction. The extraction prompt
 * also forbids storing secrets, but the model saw them anyway and would store them (measured).
 */
const PATTERNS: RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\bglpat-[A-Za-z0-9_-]{20,}\b/g,
  /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}\b/g,
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
  /\bxox[abposr]-[A-Za-z0-9-]{10,}\b/g,
  /\bAIza[0-9A-Za-z_-]{35}\b/g,
  /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
  /\b[Bb]earer\s+[A-Za-z0-9._~+/=-]{16,}/g,
  // user:password@host in URLs
  /(?<=[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:)[^\s@/]+(?=@)/gi,
];

// key = value / key: value where the key names a secret
const ASSIGNMENT = /\b([A-Za-z0-9_.-]*(?:password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|private[_-]?key|client[_-]?secret)[A-Za-z0-9_.-]*)(\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,;]+)/gi;

export const REDACTED = "[REDACTED]";

export function redactSecrets(text: string): string {
  let result = text;
  for (const pattern of PATTERNS) result = result.replace(pattern, REDACTED);
  return result.replace(ASSIGNMENT, (_match, key: string, separator: string) => `${key}${separator}${REDACTED}`);
}

/** Cut AFTER redactSecrets: a secret straddling the cut would otherwise survive as a prefix. */
export function truncate(text: string, maxLength: number): string {
  return text.slice(0, maxLength);
}
