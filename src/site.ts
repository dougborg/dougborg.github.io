import type { AnalyticsConfig, NoticeOptions } from "@dougborg/site-analytics";
import { getCollection } from "astro:content";
import { firstSentence } from "./summary.ts";

export const site = {
  title: "Doug Borg",
  description: "I build software and look after the machines it runs on.",
  email: "dougborg@dougborg.org",
};

/**
 * Visitor analytics through @dougborg/site-analytics, with this site's own Umami website ID
 * (dougborg/dougborg-dot-net#391). The ID is public: it ships in every page. Setting this to
 * undefined is the rollback: the build then publishes no tracker, privacy page, or footer link.
 */
export const analytics: AnalyticsConfig | undefined = {
  websiteId: "86b4f907-4165-4c7b-9250-fe7402c5262f",
  collector: "https://stats.dougborg.net",
  hostname: "dougborg.org",
  // The theme switch carries no data-analytics-event markup, so this site sends no declared event
  // and its notice lists none (dougborg/site-analytics#16); test/build/disclosure.test.ts holds both.
  declaredEvents: [],
};

/** The privacy notice's facts; they must describe the deployed collector. */
export const privacy: Omit<NoticeOptions, "site" | "analytics"> = {
  controller: { name: "Doug Borg", email: site.email },
  hosting: "on a server I run at home in Colorado",
  country: "the United States",
  network: { name: "Cloudflare", privacyUrl: "https://www.cloudflare.com/privacypolicy/" },
  retentionDays: 90,
  updated: "2026-09-24",
};

/** Newest first. */
export async function posts() {
  return (await getCollection("posts")).sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

/** Dates are written without a time, so format them in UTC to keep the authored day. */
export const formatDate = (date: Date) =>
  date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export const isoDate = (date: Date) => date.toISOString().slice(0, 10);

/** The résumé's accent sequence, so both sites cycle through Solarized in the same order. */
export const accentOrder = ["blue", "cyan", "green", "yellow", "orange", "magenta"] as const;

type Post = Awaited<ReturnType<typeof posts>>[number];

/** Accents count from the oldest post, so publishing a new one never recolors the archive. */
export async function postAccent(post: Post) {
  const oldestFirst = (await posts()).toReversed();
  return accentOrder[oldestFirst.findIndex((p) => p.id === post.id) % accentOrder.length];
}

const words = (post: Post) => (post.body ?? "").split(/\s+/).filter(Boolean).length;

export const readingMinutes = (post: Post) => Math.max(1, Math.round(words(post) / 230));

/** The authored description, or the post's opening sentence. */
export const summary = (post: Post) => post.data.description ?? firstSentence(post.body ?? "");

export const projects = [
  {
    name: "harness-kit",
    href: "https://github.com/dougborg/harness-kit",
    accent: "violet",
    text: "A self-improving agent harness for auditing and evolving a project's AI tooling.",
  },
  {
    name: "gdub",
    href: "https://github.com/gdubw/gdub",
    accent: "cyan",
    text: "A Gradle wrapper wrapper: gw picks the right gradlew or system Gradle for each project.",
  },
  {
    name: "solarized-ui",
    href: "https://dougborg.org/solarized-ui/",
    accent: "yellow",
    text: "The design system behind this site and my résumé: exact Solarized, light and dark.",
  },
] as const;
