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

It is off until this site has its own Umami website ID ([dougborg/dougborg-dot-net#391](https://github.com/dougborg/dougborg-dot-net/issues/391)).
To turn it on, set `analytics` in `src/site.ts`; the same build then publishes the tracker on every page, a footer link, and `/privacy/`, whose notice comes from the package and whose facts are `privacy` in `src/site.ts`.
Update `privacy.updated` whenever those facts or the package's collection change.

## Deploy

`.github/workflows/site.yml` checks, builds, and tests every pull request and push.
Pushes to `main` then deploy `dist/` to GitHub Pages; the repository's Pages source is GitHub Actions.

## Constraints

- The home page must keep the sentence "I build software and look after the machines it runs on.": the dougborg.net status probe checks for it.
- Styling comes from the design system: reusable patterns such as the accent band, marked post rows, cards, pager, and reading bar live in solarized-ui, so add missing ones there. `src/styles/site.css` holds only this site's own layout.
- The build publishes the fonts' licenses and the design system's third-party notices beside the bundled fonts in `_astro/`.
