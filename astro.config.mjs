import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import rehypeImagePerformance from "./src/lib/rehype-image-performance.mjs";

export default defineConfig({
  site: "https://linshen.example",
  output: "static",
  trailingSlash: "never",
  integrations: [mdx({ rehypePlugins: [rehypeImagePerformance] }), sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
});
