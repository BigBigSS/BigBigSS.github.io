import rss from "@astrojs/rss";
import { getCollection } from "astro:content";
import { site } from "../data/site";
import { sortByDateDesc } from "../lib/content";

export async function GET(context: { site: URL | undefined }) {
  const entries = sortByDateDesc(await getCollection("now"));

  return rss({
    title: `${site.name} · Now`,
    description: site.description,
    site: context.site ?? site.url,
    items: entries.map((entry) => ({
      title: entry.data.title ?? entry.data.summary,
      description: entry.data.summary,
      pubDate: entry.data.date,
      link: `/now`,
    })),
  });
}
