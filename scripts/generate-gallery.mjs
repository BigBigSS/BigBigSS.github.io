import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const postsDir = path.join(root, "content", "posts");
const galleryDir = path.join(root, "content", "gallery");
const outputPath = path.join(galleryDir, "index.json");

const IMAGE_PATTERN = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/gu;
const PICSUM_SEED_PATTERN = /https:\/\/picsum\.photos\/seed\/([^/]+)\/\d+\/\d+/u;
const DEFAULT_GALLERY_SIZE = 640;
const force = process.argv.includes("--force");

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(directory, entry.name);
      return entry.isDirectory() ? walk(fullPath) : fullPath;
    }),
  );

  return files.flat();
}

function normalizeGallerySrc(src) {
  const seedMatch = src.match(PICSUM_SEED_PATTERN);
  if (seedMatch) {
    return `https://picsum.photos/seed/${seedMatch[1]}/${DEFAULT_GALLERY_SIZE}/${DEFAULT_GALLERY_SIZE}`;
  }

  return src;
}

function buildPlaceholders(startSeed, count) {
  return Array.from({ length: count }, (_, offset) => {
    const seed = startSeed + offset;

    return {
      src: `https://picsum.photos/seed/${seed}/${DEFAULT_GALLERY_SIZE}/${DEFAULT_GALLERY_SIZE}`,
      alt: `占位图 ${seed}`,
      post: null,
      tone: "any",
    };
  });
}

async function main() {
  await mkdir(galleryDir, { recursive: true });

  if (!force) {
    try {
      await access(outputPath);
      console.log(`Gallery exists at ${path.relative(root, outputPath)}. Use --force to regenerate it.`);
      return;
    } catch (_) {}
  }

  const files = await walk(postsDir);
  const items = [];
  const seen = new Set();

  for (const file of files.filter((item) => /\.(md|mdx)$/u.test(item))) {
    const raw = await readFile(file, "utf-8");
    const post = path.basename(file).replace(/\.(md|mdx)$/u, "");

    for (const match of raw.matchAll(IMAGE_PATTERN)) {
      const [, alt, src] = match;
      const normalizedSrc = normalizeGallerySrc(src);

      if (seen.has(normalizedSrc)) {
        continue;
      }

      seen.add(normalizedSrc);
      items.push({
        src: normalizedSrc,
        alt: alt || post,
        post,
        tone: normalizedSrc.includes("dark") ? "dark" : "any",
      });
    }
  }

  const filled =
    items.length >= 60 ? items.slice(0, 60) : [...items, ...buildPlaceholders(1, 60 - items.length)];

  await writeFile(outputPath, `${JSON.stringify(filled, null, 2)}\n`, "utf-8");
  console.log(`Generated ${filled.length} gallery items at ${path.relative(root, outputPath)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
