import rss from "@astrojs/rss";
import { getCollection } from "astro:content";
import { site } from "../data/site";
import { publishedPosts } from "../lib/content";

export async function GET(context: { site: URL | undefined }) {
  const posts = publishedPosts(await getCollection("posts"));

  return rss({
    title: `${site.name} · Writing`,
    description: site.description,
    site: context.site ?? site.url,
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.date,
      link: `/posts/${post.id}/`,
    })),
  });
}
