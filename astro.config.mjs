import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import rehypeImagePerformance from "./src/lib/rehype-image-performance.mjs";

export default defineConfig({
  // 请将此处修改为你的 GitHub Pages 域名，例如 "https://<你的GitHub用户名>.github.io"
  // 如果你使用自定义域名，请修改为你的自定义域名，例如 "https://yourdomain.com"
  site: "https://BigBigSS.github.io",
  output: "static",
  trailingSlash: "never",
  integrations: [mdx({ rehypePlugins: [rehypeImagePerformance] }), sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
});
