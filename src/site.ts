import { getCollection } from "astro:content";

export const site = {
  title: "Doug Borg",
  description: "I build software and look after the machines it runs on.",
  email: "dougborg@dougborg.org",
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
export function summary(post: Post) {
  if (post.data.description) return post.data.description;
  const paragraph = (post.body ?? "").trim().split(/\n\s*\n/)[0].replace(/\s+/g, " ");
  const plain = paragraph.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[*_`]/g, "");
  return plain.match(/^.+?[.!?](?=\s|$)/)?.[0] ?? plain;
}

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
