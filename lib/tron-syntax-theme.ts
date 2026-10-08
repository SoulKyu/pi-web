import type { CSSProperties } from "react";
import { vscDarkPlus } from "react-syntax-highlighter/dist/cjs/styles/prism";

// Code needs several hues to carry meaning; they stay inside the Tron family:
// orange keywords, cyan strings/functions, amber literals, dim cyan-grey comments.
const COLORS: Record<string, string> = {
  keyword: "#ff9a00", "keyword.module": "#ff9a00", "keyword.control-flow": "#ff9a00",
  operator: "#ff9a00", "operator.arrow": "#ff9a00", atrule: "#ff9a00", "atrule.rule": "#ff9a00",
  tag: "#ff9a00", selector: "#ff9a00", important: "#ff9a00",
  string: "#7fe9ff", char: "#7fe9ff", "attr-value": "#7fe9ff", "atrule.url": "#7fe9ff",
  ".language-css .token.string.url": "#7fe9ff",
  function: "#5ce6ff", "function.maybe-class-name": "#5ce6ff", "class-name": "#5ce6ff",
  "maybe-class-name": "#5ce6ff", builtin: "#5ce6ff", console: "#5ce6ff", namespace: "#5ce6ff",
  ".namespace": "#5ce6ff", "imports.maybe-class-name": "#5ce6ff", "exports.maybe-class-name": "#5ce6ff",
  "attr-name": "#9fe7ff", property: "#9fe7ff",
  number: "#ffbf66", boolean: "#ffbf66", constant: "#ffbf66", symbol: "#ffbf66", unit: "#ffbf66",
  regex: "#ffbf66", escape: "#ffbf66", entity: "#ffbf66",
  comment: "#5b8a9a", prolog: "#5b8a9a", cdata: "#5b8a9a", "doctype.doctype-tag": "#5b8a9a", "doctype.name": "#5b8a9a",
  punctuation: "#7fa6b5", "tag.punctuation": "#7fa6b5", "attr-value.punctuation": "#7fa6b5",
  "attr-value.punctuation.attr-equals": "#7fa6b5", "atrule.url.punctuation": "#7fa6b5",
  ".language-html .language-css .token.punctuation": "#7fa6b5",
  ".language-html .language-javascript .token.punctuation": "#7fa6b5",
  ".language-html .token.punctuation": "#7fa6b5", "punctuation.interpolation-punctuation": "#ff9a00",
  variable: "#dff6ff", parameter: "#dff6ff", interpolation: "#dff6ff",
  deleted: "#ff4d5e", inserted: "#2ef2b0",
};

const SELECTION = "rgb(0 216 255 / 0.3)";

export const tronSyntaxTheme: Record<string, CSSProperties> = Object.fromEntries(
  Object.entries(vscDarkPlus as Record<string, CSSProperties>).map(([key, style]) => {
    if (key.includes("::selection")) return [key, { ...style, background: SELECTION }];
    if (key === 'pre[class*="language-"]' || key === 'code[class*="language-"]') return [key, { ...style, color: "#dff6ff" }];
    const color = COLORS[key];
    return [key, color ? { ...style, color } : style];
  }),
);
