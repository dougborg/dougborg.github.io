import { expect, test } from "@playwright/test";
import { collector, pages, policy, watchViolations } from "./csp.ts";

for (const [name, path, tracked] of pages) {
  test(`${name} carries a CSP without unsafe sources and reports no violations`, async ({
    page,
  }) => {
    const violations = await watchViolations(page, page);
    await page.goto(path);
    await page.evaluate(() => document.fonts.ready);
    await page.getByRole("button", { name: /Theme:/ }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

    const csp = await policy(page);
    expect(csp.get("default-src")).toEqual(["'self'"]);
    expect(csp.get("object-src")).toEqual(["'none'"]);
    expect(csp.get("base-uri")).toEqual(["'self'"]);
    expect(csp.get("form-action")).toEqual(["'self'"]);
    for (const directive of ["img-src", "font-src", "style-src"])
      expect(csp.get(directive)?.[0], directive).toBe("'self'");
    const expected = tracked ? ["'self'", collector] : ["'self'"];
    expect(csp.get("connect-src")).toEqual(expected);
    expect(csp.get("script-src")?.filter((source) => !source.startsWith("'sha256-"))).toEqual(
      expected,
    );
    for (const sources of csp.values()) {
      expect(sources).not.toContain("'unsafe-inline'");
      expect(sources).not.toContain("'unsafe-eval'");
    }
    expect(await violations()).toEqual([]);
  });
}

test("the policy is enforced, so the violation check can fail", async ({ page }) => {
  const violations = await watchViolations(page, page);
  await page.goto("/");
  await page.evaluate(() => {
    const script = document.createElement("script");
    script.textContent = "window.__injected = true";
    document.body.append(script);
  });
  expect(await page.evaluate(() => "__injected" in window)).toBe(false);
  expect((await violations()).some((v) => v.startsWith("script-src-elem blocked inline"))).toBe(
    true,
  );
});
