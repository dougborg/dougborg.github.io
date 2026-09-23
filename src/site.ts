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
