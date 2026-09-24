import { copyFile, readdir } from "node:fs/promises";
import sitemap from "@astrojs/sitemap";
import { defineConfig } from "astro/config";

const designSystem = new URL("./node_modules/@dougborg/solarized-ui/", import.meta.url);

/**
 * Vite bundles the fonts the design system stylesheet references into `_astro/`.
 * Their licenses and the package's third-party notices must be published beside them.
 */
function fontLicenses() {
  return {
    name: "font-licenses",
    hooks: {
      "astro:build:done": async ({ dir }) => {
        const fonts = new URL("dist/fonts/", designSystem);
        const assets = new URL("_astro/", dir);
        for (const file of await readdir(fonts)) {
          if (file.endsWith("-LICENSE")) await copyFile(new URL(file, fonts), new URL(file, assets));
        }
        await copyFile(
          new URL("THIRD_PARTY_NOTICES.md", designSystem),
          new URL("THIRD_PARTY_NOTICES.md", assets),
        );
      },
    },
  };
}

export default defineConfig({
  site: "https://dougborg.org",
  // Prism emits token classes that the design system highlights without color; Shiki inlines colors.
  markdown: { syntaxHighlight: "prism" },
  integrations: [sitemap(), fontLicenses()],
  // Pages cannot send headers, so Astro writes this policy into each page as a <meta> element and
  // hashes the scripts and styles it inlines. A meta policy cannot carry frame-ancestors,
  // report-uri, or sandbox. Base.astro adds the collector on the pages that load the tracker.
  security: {
    csp: {
      directives: [
        "default-src 'self'",
        "connect-src 'self'",
        "font-src 'self'",
        "img-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ],
      scriptDirective: { resources: ["'self'"] },
      styleDirective: { resources: ["'self'"] },
    },
  },
});
