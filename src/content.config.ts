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
    cover: z.string().optional(),
  }),
});

const now = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./content/now" }),
  schema: z.object({
    title: z.string().optional(),
    summary: z.string(),
    date: z.coerce.date(),
  }),
});

export const collections = { posts, now };
