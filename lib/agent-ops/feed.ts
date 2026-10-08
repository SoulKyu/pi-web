/** Minimal RSS 2.0 / Atom 1.0 reader. Pure, never throws, no DTD or external entity processing:
 *  an internal DTD subset rejects the document, custom entities stay undecoded. Linear scan with indexOf, no backtracking patterns. */
export interface FeedEntry { id: string; title: string; link: string; published?: string; summary?: string }

export const FEED_URL_MAX = 2048;
const MAX_ENTRIES = 200;
const TITLE_MAX = 300;
const SUMMARY_MAX = 2000;
const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const CDATA_OPEN = "<![CDATA[";

interface Element { attrs: string; inner: string }

/** Every `<name …>…</name>` of `xml`, in order; an unclosed element ends the scan. */
function elements(xml: string, name: string, limit = Infinity): Element[] {
  const found: Element[] = [];
  const open = `<${name}`;
  let from = 0;
  while (found.length < limit) {
    const start = xml.indexOf(open, from);
    if (start < 0) break;
    const next = xml[start + open.length];
    if (next === undefined || !" \t\r\n/>".includes(next)) { from = start + open.length; continue; }
    const gt = xml.indexOf(">", start);
    if (gt < 0) break;
    const attrs = xml.slice(start + open.length, gt);
    if (xml[gt - 1] === "/") { found.push({ attrs, inner: "" }); from = gt + 1; continue; }
    const close = xml.indexOf(`</${name}`, gt);
    if (close < 0) break;
    found.push({ attrs, inner: xml.slice(gt + 1, close) });
    from = close + name.length + 2;
  }
  return found;
}

function decode(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]{1,6}|#\d{1,7}|[a-z]{2,4});/g, (whole, body: string) => {
    if (body[0] !== "#") return NAMED[body] ?? whole;
    const code = body[1] === "x" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
    return code > 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff) ? String.fromCodePoint(code) : whole;
  });
}

/** Element text: CDATA sections verbatim, the rest entity-decoded. */
function text(inner: string): string {
  let out = "";
  let from = 0;
  for (;;) {
    const open = inner.indexOf(CDATA_OPEN, from);
    if (open < 0) return out + decode(inner.slice(from));
    const close = inner.indexOf("]]>", open + CDATA_OPEN.length);
    if (close < 0) return out + decode(inner.slice(from, open));
    out += decode(inner.slice(from, open)) + inner.slice(open + CDATA_OPEN.length, close);
    from = close + 3;
  }
}

const squash = (value: string): string => value.replace(/\s+/g, " ").trim();
/** Summaries may carry HTML (escaped or CDATA): drop the tags. */
const plain = (value: string): string => squash(value.replace(/<[^<>]{0,1000}>/g, " ").replace(/ {2,}/g, " "));
const childText = (block: string, ...names: string[]): string | undefined => {
  for (const name of names) {
    const [first] = elements(block, name, 1);
    if (first) return text(first.inner).trim() || undefined;
  }
  return undefined;
};

function attribute(attrs: string, name: string): string | undefined {
  const match = new RegExp(`(?:^|\\s)${name}\\s{0,3}=\\s{0,3}(?:"([^"]{0,2048})"|'([^']{0,2048})')`).exec(attrs.slice(0, 4096));
  const value = match?.[1] ?? match?.[2];
  return value === undefined ? undefined : decode(value);
}

function linkOf(block: string): string {
  const links = elements(block, "link");
  const atom = links.find((link) => attribute(link.attrs, "href") && ["alternate", undefined].includes(attribute(link.attrs, "rel")));
  if (atom) return attribute(atom.attrs, "href")!;
  return links.map((link) => text(link.inner).trim()).find(Boolean) ?? "";
}

function toEntry(block: string, atom: boolean): FeedEntry | null {
  const title = squash(childText(block, "title") ?? "").slice(0, TITLE_MAX);
  const link = linkOf(block);
  const id = atom ? childText(block, "id") ?? link : childText(block, "guid") ?? link;
  if (!id) return null;
  const published = childText(block, ...(atom ? ["updated", "published"] : ["pubDate"]));
  const summary = plain(childText(block, ...(atom ? ["summary", "content"] : ["description"])) ?? "").slice(0, SUMMARY_MAX);
  return { id, title, link, ...(published ? { published } : {}), ...(summary ? { summary } : {}) };
}

export function parseFeed(xml: string): FeedEntry[] {
  try {
    if (/<!ENTITY/i.test(xml)) return [];
    const doctype = xml.search(/<!DOCTYPE/i);
    let source = xml;
    if (doctype >= 0) {
      const end = xml.indexOf(">", doctype);
      if (end < 0 || xml.slice(doctype, end).includes("[")) return [];
      source = xml.slice(0, doctype) + xml.slice(end + 1);
    }
    const atom = elements(source, "entry", MAX_ENTRIES);
    const blocks = atom.length ? atom : elements(source, "item", MAX_ENTRIES);
    return blocks.map((block) => toEntry(block.inner, atom.length > 0)).filter((entry): entry is FeedEntry => entry !== null);
  } catch {
    return [];
  }
}

/** `null` when valid: https only, no userinfo. */
export function feedUrlError(value: unknown): string | null {
  if (typeof value !== "string" || value.length > FEED_URL_MAX) return `source.url must be a string of at most ${FEED_URL_MAX} characters`;
  let url: URL;
  try { url = new URL(value); } catch { return "source.url must be a valid URL"; }
  if (url.protocol !== "https:") return "source.url must use https";
  return url.username || url.password ? "source.url must not contain credentials" : null;
}
