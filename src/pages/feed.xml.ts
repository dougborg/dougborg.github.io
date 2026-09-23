import rss from "@astrojs/rss";
import type { APIContext } from "astro";
import { posts, site, summary } from "../site.ts";

export async function GET(context: APIContext) {
  return rss({
    title: site.title,
    description: site.description,
    site: context.site ?? "https://dougborg.org",
    items: (await posts()).map((post) => ({
      title: post.data.title,
      pubDate: post.data.date,
      description: summary(post),
      link: `/posts/${post.id}/`,
    })),
  });
}
