import type { CollectionEntry } from "astro:content";

export function sortByDateDesc<T extends { data: { date: Date } }>(entries: T[]) {
  return [...entries].sort(
    (left, right) => right.data.date.valueOf() - left.data.date.valueOf(),
  );
}

export function publishedPosts(posts: CollectionEntry<"posts">[]) {
  return sortByDateDesc(posts.filter((post) => !post.data.draft));
}

export function formatDate(date: Date, locale = "zh-CN") {
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

export function formatCompactDate(date: Date, locale = "en-US") {
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(date);
}
