import { AxeBuilder } from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

const pages = [
  ["home", "/"],
  ["post", "/posts/starting-over/"],
] as const;

/** Every request must stay on this site: no hotlinked fonts, styles, or scripts. */
function watchRequests(page: Page) {
  const problems: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).origin !== "http://127.0.0.1:4327") problems.push(request.url());
  });
  page.on("response", (response) => {
    if (!response.ok()) problems.push(`${response.status()} ${response.url()}`);
  });
  return problems;
}

for (const [name, path] of pages) {
  for (const colorScheme of ["light", "dark"] as const) {
    for (const width of [320, 1440]) {
      test(`${name} ${colorScheme} ${width}px is accessible and self-contained`, async ({
        page,
      }, info) => {
        await page.setViewportSize({ width, height: 900 });
        await page.emulateMedia({ colorScheme });
        const problems = watchRequests(page);
        await page.goto(path);
        await page.evaluate(() => document.fonts.ready);
        expect(problems).toEqual([]);
        expect(
          await page.evaluate(
            () =>
              document.fonts.check('16px "IBM Plex Sans"') &&
              document.fonts.check('16px "JetBrains Mono Nerd Font"'),
          ),
        ).toBe(true);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
          width,
        );
        await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: true });
        expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
        await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
        await page.keyboard.press("Tab");
        await expect(page.locator(".skip-link")).toBeFocused();
        await page.keyboard.press("Enter");
        await expect(page.getByRole("main")).toBeFocused();
      });
    }
  }
}

test("home keeps the status probe sentence and lists posts newest first", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("body")).toContainText(
    "I build software and look after the machines it runs on.",
  );
  await expect(page.getByRole("link", { name: "Starting over" })).toHaveAttribute(
    "href",
    "/posts/starting-over/",
  );
});

test("home shows each post's summary and reading time, and the projects", async ({ page }) => {
  await page.goto("/");
  const post = page.locator(".post-rows li").first();
  await expect(post).toContainText("1 min read");
  await expect(post).toContainText("This site used to be a Svbtle blog");
  await expect(page.locator(".card-grid a")).toHaveText(["harness-kit", "gdub", "solarized-ui"]);
});

test("each post row carries its accent as a tint and an edge", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  const row = page.locator(".post-rows > li").first();
  const accent = await row.getAttribute("data-accent");
  expect(accent).toBeTruthy();
  const panel = await page
    .locator(".post-rows")
    .first()
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(await row.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(panel);
  expect(await row.evaluate((el) => getComputedStyle(el).boxShadow)).toContain("inset");
});

test("a post too short to scroll leaves the reading bar empty", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/posts/starting-over/");
  const width = await page
    .locator(".read-progress")
    .evaluate((bar) => bar.getBoundingClientRect().width);
  expect(width).toBe(0);
});

test("analytics stays off until the site has a website ID", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.locator("#site-analytics")).toHaveCount(0);
  await expect(page.locator('a[rel="privacy-policy"]')).toHaveCount(0);
  expect(await page.content()).not.toContain("umami");
  expect((await request.get("/privacy/")).status()).toBe(404);
});

test("theme control cycles and the page works without scripts", async ({ page, browser }) => {
  await page.goto("/");
  const toggle = page.getByRole("button", { name: /Theme:/ });
  await toggle.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  const context = await browser.newContext({ javaScriptEnabled: false, colorScheme: "dark" });
  const noScript = await context.newPage();
  await noScript.goto("http://127.0.0.1:4327/posts/starting-over/");
  await expect(noScript.locator(".theme-toggle")).toBeHidden();
  await expect(noScript.locator("body")).toHaveCSS("background-color", "rgb(0, 43, 54)");
  await context.close();
});

test("feed, sitemap, and font licenses are published", async ({ request }) => {
  const feed = await (await request.get("/feed.xml")).text();
  expect(feed).toContain("<link>https://dougborg.org/posts/starting-over/</link>");
  const sitemap = await (await request.get("/sitemap-0.xml")).text();
  expect(sitemap).toContain("https://dougborg.org/posts/starting-over/");
  const html = await (await request.get("/")).text();
  const css = await (await request.get(html.match(/href="(\/_astro\/[^"]+\.css)"/)?.[1] ?? "")).text();
  const fonts = [...css.matchAll(/url\((\/_astro\/[^)]+\.woff2)\)/g)].map((match) => match[1]);
  expect(fonts.length).toBeGreaterThan(0);
  for (const file of [
    "ibm-plex-sans-LICENSE",
    "jetbrains-mono-LICENSE",
    "jetbrains-mono-nerd-LICENSE",
    "THIRD_PARTY_NOTICES.md",
  ])
    expect((await request.get(`/_astro/${file}`)).ok(), file).toBe(true);
});
