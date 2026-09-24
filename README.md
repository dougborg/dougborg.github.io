# dougborg.org

Astro site deployed to GitHub Pages at <https://dougborg.org>.
It uses the [`@dougborg/solarized-ui`](https://github.com/dougborg/solarized-ui) design system, pinned to an exact version so updates arrive as reviewable Dependabot pull requests.

## Write a post

Add `src/content/posts/<slug>.md` with front matter, then open a pull request:

```markdown
---
title: Post title
date: 2026-09-22
description: Optional one-line summary for the post list and feed.
---
```

The post appears at `/posts/<slug>/`, in the RSS feed at `/feed.xml`, and in `/sitemap-index.xml`.
Code blocks are highlighted with Prism, which the design system styles by weight and italics rather than color so they stay readable in both themes.

## Develop

Use the pinned Node (`.nvmrc`, also pinned for Volta) and pnpm (`packageManager`).

```sh
pnpm install --frozen-lockfile
pnpm dev            # http://localhost:4321
pnpm check          # astro check (types and templates)
pnpm build          # dist/
pnpm exec playwright install chromium
pnpm test           # Playwright and axe against the built site, both themes, 320 and 1440px
```

## Analytics

Visits are counted with [`@dougborg/site-analytics`](https://github.com/dougborg/site-analytics), which loads the self-hosted Umami tracker from `stats.dougborg.net` only when the visitor sends no Global Privacy Control or Do Not Track signal and has not opted out.
It records page views, referrers, campaign tags, Web Vitals, scroll depth, engaged time, and outbound, download, and contact clicks; the package README has the exact contract.

It is on, with this site's own Umami website, named `dougborg.org`, whose ID is in `src/site.ts` ([dougborg/dougborg-dot-net#391](https://github.com/dougborg/dougborg-dot-net/issues/391)), and loads the tracker only on `https://dougborg.org` itself, so local, preview, and CI builds never count.
`analytics` in `src/site.ts` publishes the tracker on every page, a footer link, and `/privacy/`, whose notice comes from the package and whose facts are `privacy` in `src/site.ts`.
Update `privacy.updated` whenever those facts or the package's collection change, and review any package release that widens collection before upgrading it.

To turn it off, set `analytics` to `undefined` and merge: the next deploy publishes no tracker, footer link, or privacy page, which `test/build/analytics-off.test.ts` checks on every run.
Visitors who opted out keep their `umami.disabled` flag; nothing else is stored in the browser.
To stop counting before that deploy lands, the collector can refuse this website ID on its own ([dougborg/dougborg-dot-net](https://github.com/dougborg/dougborg-dot-net)).

## Content Security Policy

GitHub Pages cannot send response headers, so the policy ships as a `<meta http-equiv="content-security-policy">` that Astro's `security.csp` writes into every page, ahead of any stylesheet or script.
`astro.config.mjs` declares it: everything from this site (`default-src 'self'`), `object-src 'none'`, `base-uri` and `form-action` limited to this site, and no `'unsafe-inline'` or `'unsafe-eval'`.
Astro hashes each script it inlines, such as the theme control, into `script-src`, so moving or editing one needs no manual hash.
Pages that load the tracker also allow the collector in `script-src` and `connect-src`; `Base.astro` adds it from `analytics` in `src/site.ts`, so the privacy page and an analytics-off build do not name it.
`test/csp.spec.ts` fails on any violation on the home page, a post, and `/privacy/`, and `test/csp-production.spec.ts` does the same with the tracker loaded on the production host.

A meta policy cannot carry `frame-ancestors`, `report-uri`/`report-to`, or `sandbox`, and Pages offers no header to add them.
So nothing stops another site framing these pages; the analytics module refuses to count a framed page, and there are no forms or authenticated actions to clickjack.
Violations are not reported anywhere; they appear only in the visitor's console.

## Deploy

`.github/workflows/site.yml` checks, builds, and tests every pull request and push.
Pushes to `main` then deploy `dist/` to GitHub Pages; the repository's Pages source is GitHub Actions.

## Constraints

- The home page must keep the sentence "I build software and look after the machines it runs on.": the dougborg.net status probe checks for it.
- Styling comes from the design system: reusable patterns such as the accent band, marked post rows, cards, pager, and reading bar live in solarized-ui, so add missing ones there. `src/styles/site.css` holds only this site's own layout.
- The build publishes the fonts' licenses and the design system's third-party notices beside the bundled fonts in `_astro/`.
