import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { siteEvents, undisclosedEvents } from "@dougborg/site-analytics";

const dist = new URL("../../dist", import.meta.url).pathname;

/** Every built HTML page, relative to dist/. */
async function pages(): Promise<string[]> {
  const entries = await readdir(dist, { recursive: true, withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith(".html"))
    .map((e) => join(e.parentPath, e.name).slice(dist.length + 1));
}

// Runs after `pnpm build`. The notice must list every event any page can send, as built, not as
// configured: this reads the pages and the notice the visitor gets (dougborg/site-analytics#16).
test("the built privacy notice discloses every event every built page can send", async () => {
  const notice = await readFile(join(dist, "privacy/index.html"), "utf8");
  const built = await pages();
  const tracked: string[] = [];
  for (const file of built) {
    const html = await readFile(join(dist, file), "utf8");
    if (html.includes('id="site-analytics"')) tracked.push(file);
    assert.deepEqual(undisclosedEvents(html, notice), [], `${file} sends what the notice omits`);
  }
  // Guards against a check that passes because it found no tracked page.
  assert.ok(tracked.includes("index.html"), "home page carries no config element");
  assert.ok(tracked.includes("posts/starting-over/index.html"), "post carries no config element");
});

// The other direction: the notice lists the built-in events and no declared event, because the
// site declares none. The page's own theme switch is named theme-toggle too, so read the list only.
test("the built privacy notice lists exactly the built-in events", async () => {
  const notice = await readFile(join(dist, "privacy/index.html"), "utf8");
  const list = notice.match(/<ul id="events">([\s\S]*?)<\/ul>/)?.[1];
  assert.ok(list, "the notice has no event list");
  const listed = [...list.matchAll(/<li><code>([^<]+)<\/code>/g)].map((match) => match[1]);
  assert.deepEqual(listed, siteEvents([]));
});
