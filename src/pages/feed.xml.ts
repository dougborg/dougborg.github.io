import rss from "@astrojs/rss";
import type { APIContext } from "astro";
import { posts, site } from "../site.ts";

export async function GET(context: APIContext) {
  return rss({
    title: site.title,
    description: site.description,
    site: context.site ?? "https://dougborg.org",
    items: (await posts()).map((post) => ({
      title: post.data.title,
      pubDate: post.data.date,
      description: post.data.description,
      link: `/posts/${post.id}/`,
    })),
  });
}
