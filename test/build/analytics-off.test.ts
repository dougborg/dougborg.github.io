import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cp, mkdtemp, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const root = new URL("../../", import.meta.url).pathname;
const markers = ["site-analytics", "stats.dougborg.net", "privacy-policy", "/privacy/"];

/** Every file under a directory, relative to it. */
async function files(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((e) => e.isFile())
    .map((e) => join(e.parentPath, e.name).slice(dir.length + 1));
}

// The rollback is setting `analytics` to undefined. Build a copy of the site that way and check
// it publishes nothing that tracks or discloses tracking, so turning analytics off stays safe.
test("with analytics undefined the build publishes no tracker, notice, or link", async () => {
  const copy = await mkdtemp(join(tmpdir(), "dougborg-org-analytics-off-"));
  try {
    for (const path of ["src", "public", "astro.config.mjs", "package.json", "tsconfig.json"])
      await cp(join(root, path), join(copy, path), { recursive: true });
    await symlink(join(root, "node_modules"), join(copy, "node_modules"));
    const astro = (outDir: string) =>
      execFileSync(join(copy, "node_modules/.bin/astro"), ["build", "--outDir", outDir], {
        cwd: copy,
        stdio: "pipe",
      });
    // Control: the committed configuration does publish every marker checked below.
    astro("dist-on");
    const on = await readFile(join(copy, "dist-on/index.html"), "utf8");
    for (const marker of markers) assert.ok(on.includes(marker), `enabled build lacks ${marker}`);

    const site = join(copy, "src/site.ts");
    const source = await readFile(site, "utf8");
    const off = source.replace(
      /export const analytics: AnalyticsConfig \| undefined = \{[^}]*\};/,
      "export const analytics: AnalyticsConfig | undefined = undefined;",
    );
    assert.notEqual(off, source, "src/site.ts no longer declares analytics as this test expects");
    await writeFile(site, off);
    astro("dist");

    const dist = join(copy, "dist");
    const published = await files(dist);
    assert.ok(published.includes("index.html"));
    assert.ok(published.includes("posts/starting-over/index.html"));
    assert.ok(!published.some((file) => file.startsWith("privacy/")), "privacy page published");
    // Astro still emits the module's chunk, because Base.astro imports the component, but no
    // page may load it: check every page and feed, inline scripts included, and every script a page
    // names.
    const loaded = new Set<string>();
    for (const file of published.filter((f) => /\.(html|xml)$/.test(f))) {
      const text = await readFile(join(dist, file), "utf8");
      for (const marker of markers) assert.ok(!text.includes(marker), `${file} contains ${marker}`);
      for (const [, src] of text.matchAll(/\/(_astro\/[^"'`\s)]+\.js)/g)) loaded.add(src);
    }
    for (const src of loaded) {
      const text = await readFile(join(dist, src), "utf8");
      for (const marker of ["umami", "stats.dougborg.net", "site-analytics"])
        assert.ok(!text.includes(marker), `${src}, loaded by a page, contains ${marker}`);
    }
  } finally {
    await rm(copy, { recursive: true, force: true });
  }
});
