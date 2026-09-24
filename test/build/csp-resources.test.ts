import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { blockedReferences, htmlReferences, matches, pagePolicy, pageReferences } from "./csp-resources.ts";

const origin = "https://dougborg.org/";
const dist = new URL("../../dist", import.meta.url).pathname;
const fixture = new URL("fixtures/offsite", import.meta.url).pathname;

// Runs after `pnpm build`. A meta policy reports nothing, so this is the only place a post that
// embeds another host's image, frame, video, or script fails before visitors' browsers block it.
test("every built page references only what its own CSP allows", async () => {
  assert.deepEqual(await blockedReferences(dist, origin), []);
});

// Guards against a scan that passes because it found nothing to check.
test("the scan sees the site's stylesheet, module script, and fonts", async () => {
  const html = await readFile(`${dist}/index.html`, "utf8");
  const refs = await pageReferences(html, new URL(origin), dist);
  const directives = (name: string) => refs.filter((ref) => ref.directive === name);
  assert.ok(directives("style-src-elem").some((ref) => ref.url.endsWith(".css")));
  assert.ok(directives("script-src-elem").some((ref) => ref.url.endsWith(".js")));
  assert.ok(directives("font-src").some((ref) => ref.url.endsWith(".woff2")));
});

test("a post with off-site embeds fails, listing each file and URL", async () => {
  assert.deepEqual(await blockedReferences(fixture, origin), [
    "posts/embeds/index.html: img-src blocks https://images.example.com/photo.jpg",
    "posts/embeds/index.html: frame-src blocks https://www.youtube-nocookie.com/embed/abc123",
    "posts/embeds/index.html: img-src blocks https://stats.dougborg.net/pixel.gif",
    // From the stylesheet the page links, checked against the page's policy.
    "posts/embeds/index.html: font-src blocks https://fonts.example.com/x.woff2",
  ]);
});

test("a page with no policy, or two, is reported rather than passed", () => {
  const meta = `<meta http-equiv="content-security-policy" content="default-src 'self'">`;
  assert.equal(pagePolicy("<p>no policy</p>"), undefined);
  assert.equal(pagePolicy(meta + meta), undefined);
  assert.deepEqual(pagePolicy(meta)?.get("default-src"), ["'self'"]);
});

test("source expressions match hosts, wildcards, ports, schemes, and paths", () => {
  const page = new URL(origin);
  const ok = (source: string, url: string) => matches(source, new URL(url), page);
  assert.ok(ok("'self'", "https://dougborg.org/a.png"));
  assert.ok(!ok("'self'", "https://www.dougborg.org/a.png"));
  assert.ok(!ok("'none'", "https://dougborg.org/a.png"));
  assert.ok(ok("https://stats.dougborg.net", "https://stats.dougborg.net/script.js"));
  assert.ok(ok("stats.dougborg.net", "https://stats.dougborg.net/script.js"));
  assert.ok(ok("http://stats.dougborg.net", "https://stats.dougborg.net/script.js"));
  assert.ok(!ok("https://stats.dougborg.net", "http://stats.dougborg.net/script.js"));
  assert.ok(ok("*.example.com", "https://a.example.com/x"));
  assert.ok(!ok("*.example.com", "https://example.com/x"));
  assert.ok(!ok("https://example.com", "https://example.com:8443/x"));
  assert.ok(ok("https://example.com:*", "https://example.com:8443/x"));
  assert.ok(ok("https://example.com/img/", "https://example.com/img/a.png"));
  assert.ok(!ok("https://example.com/img/a.png", "https://example.com/img/b.png"));
  assert.ok(ok("data:", "data:image/png;base64,AA"));
  assert.ok(!ok("*", "data:image/png;base64,AA"));
});

test("srcset candidates split with or without spaces; comments, script and style text are not markup", () => {
  const refs = htmlReferences(
    [
      `<img srcset="https://a.example/1.jpg 1x,https://b.example/2.jpg 2x">`,
      `<!-- <img src="https://c.example/commented-out.jpg"> -->`,
      `<style>p::before { content: "<img src=x>"; }</style >`,
      `<script>document.write('<img src="https://d.example/in-script.jpg">')</script >`,
      `<img src="https://e.example/after.jpg">`,
    ].join(""),
  );
  assert.deepEqual(
    refs.map((ref) => ref.url),
    ["https://a.example/1.jpg", "https://b.example/2.jpg", "https://e.example/after.jpg"],
  );
});
