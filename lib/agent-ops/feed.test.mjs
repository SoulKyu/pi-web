import assert from "node:assert/strict";
import { test } from "node:test";
const jiti = (await import("jiti")).createJiti(import.meta.url);
const { parseFeed } = await jiti.import("./feed.ts");

const ATOM = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
<title>T</title>
<entry><id>tag:x,1</id><title type="html">A &amp; B &#233; &#x41;</title>
<link rel="self" href="https://x/self"/><link rel="alternate" href="https://x/a?x=1&amp;y=2"/>
<updated>2026-01-01T00:00:00Z</updated><summary><![CDATA[<p>hello <b>world</b> & co</p>]]></summary></entry>
<entry><id>tag:x,2</id><title>Second</title><link href="https://x/b"/><published>2026-01-02T00:00:00Z</published><content>c &lt;i&gt;t&lt;/i&gt;</content></entry>
</feed>`;
const RSS = `<rss version="2.0"><channel><title>C</title>
<item><title><![CDATA[Item <1>]]></title><link>https://x/1</link><guid>g1</guid><pubDate>Mon, 01 Jan 2026 00:00:00 GMT</pubDate><description>d &quot;q&quot; &apos;a&apos;</description></item>
<item><title>No guid</title><link>https://x/2</link></item>
</channel></rss>`;

test("Atom: id, title, alternate link, dates, CDATA and entities", () => {
  const [a, b] = parseFeed(ATOM);
  assert.deepEqual(a, { id: "tag:x,1", title: "A & B é A", link: "https://x/a?x=1&y=2", published: "2026-01-01T00:00:00Z", summary: "hello world & co" });
  assert.equal(b.link, "https://x/b");
  assert.equal(b.published, "2026-01-02T00:00:00Z");
  assert.equal(b.summary, "c t");
});

test("RSS: guid or link as id, CDATA title, entities in description", () => {
  const [a, b] = parseFeed(RSS);
  assert.equal(a.id, "g1");
  assert.equal(a.title, "Item <1>");
  assert.equal(a.summary, `d "q" 'a'`);
  assert.equal(a.published, "Mon, 01 Jan 2026 00:00:00 GMT");
  assert.equal(b.id, "https://x/2");
});

test("a DOCTYPE with an internal subset is rejected, a plain one is stripped", () => {
  const evil = `<?xml version="1.0"?><!DOCTYPE feed [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>${ATOM}`;
  assert.deepEqual(parseFeed(evil), []);
  assert.equal(parseFeed(`<!DOCTYPE rss>${RSS}`).length, 2);
  assert.deepEqual(parseFeed(`<!ENTITY a "b">${RSS}`), []);
});

test("custom entities stay undecoded", () => {
  assert.equal(parseFeed(`<rss><channel><item><title>&xxe;</title><link>https://x</link></item></channel></rss>`)[0].title, "&xxe;");
});

test("junk returns [] and never throws", () => {
  for (const junk of ["", "not xml", "<rss><channel><item>", "<entry><id>", "\u0000".repeat(10), "<".repeat(5000), "<item>".repeat(5000)]) assert.ok(Array.isArray(parseFeed(junk)));
  assert.deepEqual(parseFeed("<html><body>hi</body></html>"), []);
});

test("clips fields and caps entries at 200", () => {
  const long = `<rss><channel><item><title>${"t".repeat(900)}</title><link>https://x</link><description>${"s".repeat(5000)}</description></item></channel></rss>`;
  const [e] = parseFeed(long);
  assert.equal(e.title.length, 300);
  assert.equal(e.summary.length, 2000);
  const many = `<rss><channel>${Array.from({ length: 300 }, (_, i) => `<item><title>n${i}</title><link>https://x/${i}</link></item>`).join("")}</channel></rss>`;
  assert.equal(parseFeed(many).length, 200);
});

test("parsing a hostile large input stays fast", () => {
  const started = Date.now();
  parseFeed(`<item>${"<link ".repeat(100_000)}`);
  parseFeed(`<entry>${"<![CDATA[".repeat(100_000)}`);
  assert.ok(Date.now() - started < 2000);
});
