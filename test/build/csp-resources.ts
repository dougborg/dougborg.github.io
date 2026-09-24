/**
 * Checks what a built page references against the page's own meta CSP. A meta policy reports
 * nothing, so an off-site image, frame, or script in a post would be blocked silently in visitors'
 * browsers; this finds it at build time instead. Reading each page's policy rather than a list of
 * allowed hosts means the check follows astro.config.mjs and Base.astro without a copy to update.
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

export type Policy = Map<string, string[]>;

/** A URL a page asks the browser to fetch, and the directive that governs it. */
export interface Reference {
  directive: string;
  url: string;
}

/** Where a directive falls back to when a policy omits it (CSP Level 3). */
const fallbacks: Record<string, string[]> = {
  "script-src-elem": ["script-src", "default-src"],
  "style-src-elem": ["style-src", "default-src"],
  "frame-src": ["child-src", "default-src"],
};

/**
 * Every reference in every page under dir that the page's own policy would block, as
 * "file: directive blocks url". Same-origin stylesheets a page links are read from dir and checked
 * against that page's policy too, since their url()s load under it. A page without exactly one
 * meta policy is reported, because the check cannot say what it allows.
 */
export async function blockedReferences(dir: string, origin: string): Promise<string[]> {
  const blocked: string[] = [];
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  const pages = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".html"))
    .map((entry) => join(entry.parentPath, entry.name).slice(dir.length + 1))
    .sort();
  for (const file of pages) {
    const html = await readFile(join(dir, file), "utf8");
    const policy = pagePolicy(html);
    if (!policy) {
      blocked.push(`${file}: no single meta content-security-policy`);
      continue;
    }
    const pageUrl = new URL(file.replace(/(^|\/)index\.html$/, "$1"), origin);
    for (const ref of await pageReferences(html, pageUrl, dir))
      if (!allows(policy, ref, pageUrl)) blocked.push(`${file}: ${ref.directive} blocks ${ref.url}`);
  }
  return blocked;
}

/** A page's own references plus those of the same-origin stylesheets it links. */
export async function pageReferences(html: string, pageUrl: URL, dir: string): Promise<Reference[]> {
  const refs = htmlReferences(html);
  for (const { directive, url } of [...refs]) {
    const target = new URL(url, pageUrl);
    if (directive !== "style-src-elem" || target.origin !== pageUrl.origin) continue;
    const css = await readFile(join(dir, decodeURIComponent(target.pathname)), "utf8");
    // A stylesheet's url()s resolve against the stylesheet, not the page.
    for (const ref of cssReferences(css)) refs.push({ ...ref, url: new URL(ref.url, target).href });
  }
  return refs;
}

/** The policy from the page's <meta http-equiv="content-security-policy">, or undefined. */
export function pagePolicy(html: string): Policy | undefined {
  const metas = tags(html).filter(
    ({ name, attrs }) =>
      name === "meta" && attrs.get("http-equiv")?.toLowerCase() === "content-security-policy",
  );
  if (metas.length !== 1) return undefined;
  const content = metas[0].attrs.get("content") ?? "";
  return new Map(
    content
      .split(";")
      .map((directive) => directive.trim().split(/\s+/))
      .filter(([name]) => name)
      .map(([name, ...sources]) => [name.toLowerCase(), sources]),
  );
}

/** Every resource the markup references: elements, inline styles, and <style> blocks. */
export function htmlReferences(html: string): Reference[] {
  const found: Reference[] = [];
  const add = (directive: string, url: string | undefined) => {
    if (url?.trim()) found.push({ directive, url: url.trim() });
  };
  for (const { name, attrs } of tags(html)) {
    const src = attrs.get("src");
    switch (name) {
      case "img":
        add("img-src", src);
        break;
      case "input":
        if (attrs.get("type")?.toLowerCase() === "image") add("img-src", src);
        break;
      case "iframe":
      case "frame":
        add("frame-src", src);
        break;
      case "script":
        add("script-src-elem", src);
        break;
      case "video":
      case "audio":
      case "track":
        add("media-src", src);
        break;
      case "source":
        // <source src> belongs to <video>/<audio>; <source srcset> to <picture>.
        add("media-src", src);
        break;
      case "embed":
        add("object-src", src);
        break;
      case "object":
        add("object-src", attrs.get("data"));
        break;
      case "link":
        for (const ref of linkReferences(attrs)) add(ref.directive, ref.url);
        break;
    }
    for (const candidate of srcset(attrs.get("srcset"))) add("img-src", candidate);
    add("img-src", attrs.get("poster"));
    for (const ref of cssReferences(attrs.get("style") ?? "")) add(ref.directive, ref.url);
  }
  for (const [, css] of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi))
    for (const ref of cssReferences(css)) add(ref.directive, ref.url);
  return found;
}

/** url() and @import references in a stylesheet; fonts are governed by font-src, the rest img-src. */
export function cssReferences(css: string): Reference[] {
  const found: Reference[] = [];
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const faces = text.match(/@font-face\s*\{[^}]*\}/gi) ?? [];
  const rest = faces.reduce((remaining, face) => remaining.replace(face, ""), text);
  for (const face of faces)
    for (const url of cssUrls(face)) found.push({ directive: "font-src", url });
  for (const [, url] of rest.matchAll(/@import\s+(?:url\(\s*)?["']?([^"')\s;]+)/gi))
    found.push({ directive: "style-src-elem", url });
  const imports = rest.replace(/@import[^;]*;/gi, "");
  for (const url of cssUrls(imports)) found.push({ directive: "img-src", url });
  return found;
}

/** Whether the policy lets a page at pageUrl fetch the reference. */
export function allows(policy: Policy, { directive, url }: Reference, pageUrl: URL): boolean {
  const governing = [directive, ...(fallbacks[directive] ?? ["default-src"])].find((name) =>
    policy.has(name),
  );
  // No directive and no default-src: the policy does not restrict this kind of fetch.
  if (!governing) return true;
  const target = new URL(url, pageUrl);
  return (policy.get(governing) ?? []).some((source) => matches(source, target, pageUrl));
}

/** Does one CSP source expression match a URL? Covers what a static site uses, not every form. */
export function matches(source: string, target: URL, pageUrl: URL): boolean {
  const lower = source.toLowerCase();
  if (lower === "'self'") return target.origin === pageUrl.origin;
  if (lower.startsWith("'")) return false; // 'none', hashes, nonces, keywords: never a URL.
  if (lower === "*") return /^(https?|wss?):$/.test(target.protocol);
  if (/^[a-z][a-z0-9+.-]*:$/.test(lower)) return target.protocol === lower;
  const parts = lower.match(/^(?:([a-z][a-z0-9+.-]*):\/\/)?(\*\.)?([^/:]+)(?::(\d+|\*))?(\/.*)?$/);
  if (!parts) return false;
  const [, scheme, wildcard, host, port, path] = parts;
  const expected = scheme ?? pageUrl.protocol.slice(0, -1);
  const upgraded = expected === "http" && target.protocol === "https:";
  if (target.protocol !== `${expected}:` && !upgraded) return false;
  if (wildcard ? !target.hostname.endsWith(`.${host}`) : target.hostname !== host) return false;
  if (port !== "*" && target.port !== (port ?? "")) return false;
  if (!path) return true;
  return path.endsWith("/") ? target.pathname.startsWith(path) : target.pathname === path;
}

/** <link> relations that fetch something, and the directive for each. */
function linkReferences(attrs: Map<string, string>): Reference[] {
  const href = attrs.get("href");
  if (!href) return [];
  const rel = (attrs.get("rel") ?? "").toLowerCase().split(/\s+/);
  const as: Record<string, string> = {
    script: "script-src-elem",
    style: "style-src-elem",
    font: "font-src",
    image: "img-src",
    fetch: "connect-src",
  };
  if (rel.includes("stylesheet")) return [{ directive: "style-src-elem", url: href }];
  if (rel.includes("icon") || rel.includes("apple-touch-icon"))
    return [{ directive: "img-src", url: href }];
  if (rel.includes("manifest")) return [{ directive: "manifest-src", url: href }];
  if (rel.includes("modulepreload")) return [{ directive: "script-src-elem", url: href }];
  if (rel.includes("preload") || rel.includes("prefetch"))
    return [{ directive: as[attrs.get("as")?.toLowerCase() ?? ""] ?? "default-src", url: href }];
  return [];
}

/** The URLs in a srcset: comma-separated candidates, each a URL and an optional descriptor. */
function srcset(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(/\s*,\s*/)
    .map((candidate) => candidate.trim().split(/\s+/)[0])
    .filter(Boolean);
}

function cssUrls(css: string): string[] {
  return [...css.matchAll(/url\(\s*(["']?)(.*?)\1\s*\)/gi)].map(([, , url]) => url);
}

interface Tag {
  name: string;
  attrs: Map<string, string>;
}

/** Start tags with their attributes, ignoring comments and the text inside scripts and styles. */
function tags(html: string): Tag[] {
  const markup = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/(<script\b[^>]*>)[\s\S]*?<\/script>/gi, "$1</script>")
    .replace(/(<style\b[^>]*>)[\s\S]*?<\/style>/gi, "$1</style>");
  return [...markup.matchAll(/<([a-zA-Z][\w-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/g)].map(
    ([, name, rest]) => ({
      name: name.toLowerCase(),
      attrs: new Map(
        [...rest.matchAll(/([^\s"'=<>/]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s"'>]+))?/g)].map(
          ([, key, value = ""]) => [key.toLowerCase(), decode(value.replace(/^["']|["']$/g, ""))],
        ),
      ),
    }),
  );
}

function decode(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}
