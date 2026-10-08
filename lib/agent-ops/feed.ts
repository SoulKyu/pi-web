/** Minimal RSS 2.0 / Atom 1.0 reader. Pure, never throws, no DTD or external entity processing:
 *  an internal DTD subset rejects the document, custom entities stay undecoded. Linear scan with indexOf, no backtracking patterns. */
export interface FeedEntry { id: string; title: string; link: string; published?: string; summary?: string }

export const FEED_URL_MAX = 2048;
const MAX_ENTRIES = 200;
const TITLE_MAX = 300;
const LINK_MAX = 2048;
const ID_MAX = 500;
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
  return (atom ? attribute(atom.attrs, "href")! : links.map((link) => text(link.inner).trim()).find(Boolean) ?? "").slice(0, LINK_MAX);
}

function toEntry(block: string, atom: boolean): FeedEntry | null {
  const title = squash(childText(block, "title") ?? "").slice(0, TITLE_MAX);
  const link = linkOf(block);
  const id = (atom ? childText(block, "id") ?? link : childText(block, "guid") ?? link).slice(0, ID_MAX); // entryHash hashes the clipped id: seen stays stable
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

const privateV4 = ([a, b]: number[]): boolean =>
  a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);

/** IPv6 groups of a URL-normalised literal (`::` expanded, an embedded dotted v4 converted); null when not parseable. */
function v6Groups(host: string): number[] | null {
  let text = host;
  const dotted = /(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(text);
  if (dotted) text = text.slice(0, dotted.index) + ((+dotted[1] << 8) | +dotted[2]).toString(16) + ":" + ((+dotted[3] << 8) | +dotted[4]).toString(16);
  const [head, tail, extra] = text.split("::");
  if (extra !== undefined) return null;
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const fill = tail === undefined ? 0 : 8 - left.length - right.length;
  const groups = [...left, ...Array<string>(Math.max(fill, 0)).fill("0"), ...right].map((group) => parseInt(group, 16));
  return groups.length === 8 && groups.every((group) => group >= 0 && group <= 0xffff) ? groups : null;
}

/** Loopback, private, link-local (cloud metadata), CGNAT and internal names. `new URL` has already normalised decimal/hex/short IPv4 into dotted form.
 *  ponytail: DNS rebinding (a public name resolving to a private IP at fetch time) is not covered. */
export function privateHostError(hostname: string): string | null {
  const refuse = "source.url must not point to a private or internal host";
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal")) return refuse;
  if (host.startsWith("[")) {
    const groups = v6Groups(host.slice(1, -1));
    if (!groups) return refuse; // fail closed
    if (groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff) return privateV4([groups[6] >> 8, groups[6] & 255]) ? refuse : null; // ::ffff:a.b.c.d
    if (groups.slice(0, 7).every((group) => group === 0)) return groups[7] <= 1 ? refuse : null; // :: and ::1
    return (groups[0] & 0xfe00) === 0xfc00 || (groups[0] & 0xffc0) === 0xfe80 ? refuse : null;
  }
  const v4 = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(host);
  return v4 && privateV4(v4.slice(1).map(Number)) ? refuse : null;
}

/** `null` when valid: https only, no userinfo, no private host. */
export function feedUrlError(value: unknown): string | null {
  if (typeof value !== "string" || value.length > FEED_URL_MAX) return `source.url must be a string of at most ${FEED_URL_MAX} characters`;
  let url: URL;
  try { url = new URL(value); } catch { return "source.url must be a valid URL"; }
  if (url.protocol !== "https:") return "source.url must use https";
  if (url.username || url.password) return "source.url must not contain credentials";
  return privateHostError(url.hostname);
}
