import { AxeBuilder } from "@axe-core/playwright";
import { privacyNotice } from "@dougborg/site-analytics";
import { chromium, expect, type Page, test } from "@playwright/test";

const pages = [
  ["home", "/"],
  ["post", "/posts/starting-over/"],
] as const;

/** The privacy page is not tracked, but must meet the same bar. */
const checkedPages = [...pages, ["privacy", "/privacy/"]] as const;

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

for (const [name, path] of checkedPages) {
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

/** Restated here rather than imported, so a change to the published config must change a test. */
const analyticsConfig = {
  websiteId: "86b4f907-4165-4c7b-9250-fe7402c5262f",
  collector: "https://stats.dougborg.net",
  hostname: "dougborg.org",
  declaredEvents: [],
};

for (const [name, path] of pages) {
  test(`${name} carries the config element, the module, and the privacy link`, async ({ page }) => {
    await page.goto(path);
    const config = page.locator('script#site-analytics[type="application/json"]');
    await expect(config).toHaveCount(1);
    expect(JSON.parse((await config.textContent()) ?? "")).toEqual(analyticsConfig);
    await expect(page.locator('script[type="module"][src*="Analytics"]')).toHaveCount(1);
    await expect(page.locator('footer a[rel="privacy-policy"]')).toHaveAttribute("href", "/privacy/");
    // 127.0.0.1 is not the production host, so the module refuses to load the tracker here.
    await expect(config).toHaveAttribute("data-state", "blocked");
  });
}

test("the privacy page is the package's notice and its opt-out works, uncounted", async ({
  page,
  request,
}) => {
  await page.goto("/privacy/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Privacy notice");
  await expect(page.locator("#site-analytics")).toHaveCount(0);
  const notice = privacyNotice({
    site: "dougborg.org",
    analytics: analyticsConfig,
    controller: { name: "Doug Borg", email: "dougborg@dougborg.org" },
    hosting: "on a server I run at home in Colorado",
    country: "the United States",
    network: { name: "Cloudflare", privacyUrl: "https://www.cloudflare.com/privacypolicy/" },
    retentionDays: 90,
    updated: "2026-09-24",
  });
  // The build publishes the package's notice verbatim.
  expect(await (await request.get("/privacy/")).text()).toContain(notice);

  const button = page.getByRole("button", { name: "Stop counting my visits" });
  await button.click();
  expect(await page.evaluate(() => localStorage.getItem("umami.disabled"))).toBe("1");
  await expect(page.getByRole("button", { name: "Resume counting my visits" })).toBeVisible();
});

/**
 * Serve the built site as https://dougborg.org in a browser that does not report automation, so
 * the module does try to load the tracker, and fail every request to the collector.
 */
test("pages render and work when the collector is down", async ({ baseURL }) => {
  const browser = await chromium.launch({
    args: ["--disable-blink-features=AutomationControlled"],
  });
  try {
    const context = await browser.newContext();
    const collector: string[] = [];
    await context.route("https://dougborg.org/**", async (route) => {
      const url = new URL(route.request().url());
      return route.fulfill({
        response: await route.fetch({ url: new URL(url.pathname + url.search, baseURL).href }),
      });
    });
    await context.route("https://stats.dougborg.net/**", (route) => {
      collector.push(route.request().url());
      return route.abort("connectionrefused");
    });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const response = await page.goto("https://dougborg.org/");
    expect(response?.status()).toBe(200);
    await expect(page.locator("#site-analytics")).toHaveAttribute("data-state", "failed");
    await page.getByRole("link", { name: "Starting over" }).click();
    await expect(page).toHaveURL("https://dougborg.org/posts/starting-over/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Starting over");
    await expect(page.locator("#site-analytics")).toHaveAttribute("data-state", "failed");
    expect(collector).toEqual([
      "https://stats.dougborg.net/script.js",
      "https://stats.dougborg.net/script.js",
    ]);
    expect(errors).toEqual([]);
  } finally {
    await browser.close();
  }
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
