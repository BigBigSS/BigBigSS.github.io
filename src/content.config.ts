import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const posts = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./content/posts" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
    status: z.enum(["draft", "published", "ai"]).default("published"),
    cover: z.string().optional(),
  }),
});

const labs = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./content/labs" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    tags: z.array(z.string()).default([]),
    demo: z.string(),
    download: z.string().optional(),
    source: z.string().optional(),
    draft: z.boolean().default(false),
  }),
});

const now = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./content/now" }),
  schema: z.object({
    title: z.string().optional(),
    summary: z.string(),
    date: z.coerce.date(),
    // note = 小随笔（幕帘展开阅读）；article = 大文章（独立页面，沿用旧实验室文章布局）
    kind: z.enum(["note", "article"]).default("note"),
    tags: z.array(z.string()).default([]),
  }),
});

export const collections = { posts, labs, now };
