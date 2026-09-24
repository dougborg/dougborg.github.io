import { expect, test } from "@playwright/test";
import { collector, pages, watchViolations } from "./csp.ts";

/**
 * Serve the built site as https://dougborg.org in a browser that does not report automation, so
 * the module loads the tracker. A stand-in tracker loads from the collector and reports to it the
 * way Umami does; both requests are answered here, so nothing reaches the real collector.
 *
 * Hiding automation forces a worker of its own, which is why this test has its own file.
 */
test.use({ launchOptions: { args: ["--disable-blink-features=AutomationControlled"] } });

test("on the production host the tracker loads and reports without a violation", async ({
  baseURL,
  context,
}) => {
  await context.route("https://dougborg.org/**", async (route) => {
    const url = new URL(route.request().url());
    return route.fulfill({
      response: await route.fetch({ url: new URL(url.pathname + url.search, baseURL).href }),
    });
  });
  const sent: string[] = [];
  await context.route(`${collector}/**`, (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname === "/script.js")
      return route.fulfill({
        contentType: "text/javascript",
        // Umami's request shape: JSON with custom headers, so the browser sends a preflight.
        body: `window.umami = { track: () => Promise.resolve() };
fetch("${collector}/api/send", {
  method: "POST",
  keepalive: true,
  headers: { "Content-Type": "application/json", "x-umami-website-id": "test" },
  body: "{}",
});`,
      });
    if (route.request().method() === "POST") sent.push(pathname);
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "content-type, x-umami-website-id",
      },
      body: "{}",
    });
  });
  const page = await context.newPage();
  const violations = await watchViolations(context, page);

  for (const [, path, tracked] of pages) {
    await page.goto(`https://dougborg.org${path}`);
    if (tracked)
      await expect(page.locator("#site-analytics")).toHaveAttribute("data-state", "loaded");
  }
  await expect.poll(() => sent).toEqual(["/api/send", "/api/send"]);
  expect(await violations()).toEqual([]);
});
