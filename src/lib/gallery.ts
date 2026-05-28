import { readFile } from "node:fs/promises";
import path from "node:path";

export type GalleryItem = {
  id?: string;
  src: string;
  thumbSrc?: string;
  fullSrc?: string;
  liveVideoSrc?: string;
  originalImageSrc?: string;
  originalVideoSrc?: string;
  type?: "image" | "live";
  title?: string;
  description?: string;
  mood?: string;
  alt: string;
  post: string | null;
  tone: "light" | "dark" | "any";
  enabled?: boolean;
  featured?: boolean;
  order?: number;
};

const galleryPath = path.join(process.cwd(), "content", "gallery", "index.json");
let galleryItemsPromise: Promise<GalleryItem[]> | undefined;

async function readGalleryItems() {
  if (!galleryItemsPromise) {
    galleryItemsPromise = readFile(galleryPath, "utf-8")
      .then((raw) => JSON.parse(raw) as GalleryItem[])
      .then((items) => (Array.isArray(items) ? items : []))
      .catch(() => []);
  }

  return galleryItemsPromise;
}

export async function getGalleryItems(limit?: number) {
  const items = (await readGalleryItems())
    .filter((item) => item.enabled !== false)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return typeof limit === "number" ? items.slice(0, limit) : items;
}
