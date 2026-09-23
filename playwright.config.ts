import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./test",
  testMatch: "*.spec.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  outputDir: "test-results",
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: { baseURL: "http://127.0.0.1:4327", browserName: "chromium", trace: "retain-on-failure" },
  webServer: {
    command: "pnpm preview --port 4327 --ignore-lock",
    url: "http://127.0.0.1:4327",
    reuseExistingServer: false,
  },
});
