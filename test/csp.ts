import { type BrowserContext, expect, type Page } from "@playwright/test";

export const collector = "https://stats.dougborg.net";

/** Tracked pages allow the collector; the privacy page loads only the opt-out control. */
export const pages = [
  ["home", "/", true],
  ["post", "/posts/starting-over/", true],
  ["privacy", "/privacy/", false],
] as const;

/**
 * Record every CSP violation any page reports, across navigations, and every console error, which is
 * where Chromium reports a blocked resource or inline script.
 */
export async function watchViolations(target: Page | BrowserContext, page: Page) {
  const seen: string[] = [];
  await target.exposeFunction("__reportCspViolation", (violation: string) => seen.push(violation));
  await target.addInitScript(() => {
    const report = (window as unknown as { __reportCspViolation: (v: string) => void })
      .__reportCspViolation;
    document.addEventListener("securitypolicyviolation", (event) =>
      report(`${event.effectiveDirective} blocked ${event.blockedURI || "inline"}`),
    );
  });
  page.on("console", (message) => {
    if (message.type() === "error") seen.push(message.text());
  });
  page.on("pageerror", (error) => seen.push(error.message));
  // Violation events are queued tasks; let the page run them before reading.
  return async () => {
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 50)));
    return seen;
  };
}

/** The policy as a map of directive to sources. */
export async function policy(page: Page) {
  const meta = page.locator('meta[http-equiv="content-security-policy"]');
  await expect(meta).toHaveCount(1);
  const content = (await meta.getAttribute("content")) ?? "";
  return new Map(
    content
      .split(";")
      .map((directive) => directive.trim().split(/\s+/))
      .filter(([name]) => name)
      .map(([name, ...sources]) => [name, sources]),
  );
}

