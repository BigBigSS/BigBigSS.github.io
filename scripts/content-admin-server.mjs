import { createServer } from "node:http";
import { readFile, readdir, writeFile, mkdir, rm, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

const PORT = Number(process.env.CONTENT_ADMIN_PORT || 4322);
const ROOT = process.cwd();
const NOW_DIR = path.join(ROOT, "content", "now");
const POSTS_DIR = path.join(ROOT, "content", "posts");
const GALLERY_PATH = path.join(ROOT, "content", "gallery", "index.json");
const CAPABILITIES_PATH = path.join(ROOT, "src", "data", "capabilities.json");
const GALLERY_UPLOAD_DIR = path.join(ROOT, "public", "uploads", "gallery");
const GALLERY_THUMB_DIR = path.join(GALLERY_UPLOAD_DIR, "thumbs");
const GALLERY_FULL_DIR = path.join(GALLERY_UPLOAD_DIR, "full");
const GALLERY_LIVE_DIR = path.join(GALLERY_UPLOAD_DIR, "live");
const GALLERY_ORIGINAL_DIR = path.join(GALLERY_UPLOAD_DIR, "originals");
const ADMIN_CLIENT_PATH = path.join(ROOT, "scripts", "admin-client.html");
const PUBLIC_DIR = path.join(ROOT, "public");
const execFileAsync = promisify(execFile);

const send = (res, status, payload) => {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
    "access-control-allow-headers": "content-type",
  });
  res.end(body);
};

const sendText = (res, status, body, contentType = "text/html; charset=utf-8") => {
  res.writeHead(status, {
    "content-type": contentType,
  });
  res.end(body);
};

const sendFile = async (res, filePath) => {
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(PUBLIC_DIR)) {
    return send(res, 403, { error: "Forbidden" });
  }

  await stat(resolved);
  const ext = path.extname(resolved).toLowerCase();
  const mime =
    {
      ".svg": "image/svg+xml",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".webp": "image/webp",
      ".gif": "image/gif",
      ".mp4": "video/mp4",
      ".mov": "video/quicktime",
    }[ext] || "application/octet-stream";
  sendText(res, 200, await readFile(resolved), mime);
};

const readBody = async (req) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf-8"));
};

const safeSlug = (value, fallback = "entry") => {
  const slug = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9\u4e00-\u9fa5-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || fallback;
};

const parseDataUrl = (dataUrl, pattern) => {
  const match = String(dataUrl || "").match(pattern);
  if (!match) throw new Error("Invalid upload data");
  return {
    mime: match[1],
    buffer: Buffer.from(match[2], "base64"),
  };
};

const imageExtFromMime = (mime) => {
  const subtype = mime.split("/")[1]?.toLowerCase().replace("jpeg", "jpg");
  if (!["jpg", "png", "webp", "gif", "heic", "heif"].includes(subtype)) {
    throw new Error(`Unsupported image type: ${mime}`);
  }
  return subtype;
};

const videoExtFromMime = (mime) => {
  const subtype = mime.split("/")[1]?.toLowerCase();
  if (mime === "video/quicktime") return "mov";
  if (!["mp4", "mov", "quicktime"].includes(subtype)) {
    throw new Error(`Unsupported video type: ${mime}`);
  }
  return subtype === "quicktime" ? "mov" : subtype;
};

const publicPath = (filePath) => `/${path.relative(PUBLIC_DIR, filePath).split(path.sep).join("/")}`;

const normalizeGalleryItem = (item, index = 0) => {
  const fullSrc = item.fullSrc || item.src || "";
  const fallbackId = safeSlug(item.id || item.title || item.alt || path.basename(fullSrc), `gallery-${index + 1}`);
  return {
    id: fallbackId,
    type: item.type === "live" ? "live" : "image",
    title: item.title || item.alt || fallbackId,
    alt: item.alt || item.title || fallbackId,
    enabled: item.enabled !== false,
    featured: Boolean(item.featured),
    order: Number.isFinite(Number(item.order)) ? Number(item.order) : index + 1,
    src: item.src || fullSrc,
    thumbSrc: item.thumbSrc || item.src || fullSrc,
    fullSrc,
    ...(item.liveVideoSrc ? { liveVideoSrc: item.liveVideoSrc } : {}),
    ...(item.originalImageSrc ? { originalImageSrc: item.originalImageSrc } : {}),
    ...(item.originalVideoSrc ? { originalVideoSrc: item.originalVideoSrc } : {}),
    post: item.post || null,
    tone: item.tone || "any",
    ...(item.importHash ? { importHash: item.importHash } : {}),
  };
};

const resizeImage = async (inputPath, outputPath, maxSize) => {
  await execFileAsync(
    "ffmpeg",
    [
      "-y",
      "-i",
      inputPath,
      "-vf",
      `scale='min(${maxSize},iw)':-2`,
      "-q:v",
      maxSize <= 600 ? "4" : "3",
      "-frames:v",
      "1",
      outputPath,
    ],
    { maxBuffer: 20 * 1024 * 1024 }
  );
};

const transcodeLiveVideo = async (inputPath, outputPath) => {
  await execFileAsync(
    "ffmpeg",
    [
      "-y",
      "-i",
      inputPath,
      "-vf",
      "scale='min(1440,iw)':-2",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      "-an",
      outputPath,
    ],
    { maxBuffer: 20 * 1024 * 1024 }
  );
};

const parseFrontmatter = (source) => {
  const match = source.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { data: {}, body: source };
  return {
    data: parseYaml(match[1]) || {},
    body: match[2] || "",
  };
};

const toFrontmatter = (data, body) => {
  const yaml = stringifyYaml(data, {
    lineWidth: 0,
  }).trim();
  return `---\n${yaml}\n---\n${String(body || "").trim()}\n`;
};

const readMdxDir = async (dir) => {
  const files = (await readdir(dir)).filter((file) => file.endsWith(".md") || file.endsWith(".mdx"));
  const entries = await Promise.all(
    files.map(async (file) => {
      const fullPath = path.join(dir, file);
      const parsed = parseFrontmatter(await readFile(fullPath, "utf-8"));
      return {
        id: file.replace(/\.(md|mdx)$/u, ""),
        file,
        ...parsed.data,
        body: parsed.body.trim(),
      };
    })
  );
  return entries.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
};

const writeNow = async (payload) => {
  const date = payload.date || new Date().toISOString().slice(0, 10);
  const id = safeSlug(payload.id || date, date);
  const originalId = safeSlug(payload.originalId || "");
  const file = `${id}.mdx`;
  await mkdir(NOW_DIR, { recursive: true });
  if (originalId && originalId !== id) {
    await rm(path.join(NOW_DIR, `${originalId}.mdx`), { force: true });
  }
  await writeFile(
    path.join(NOW_DIR, file),
    toFrontmatter(
      {
        date,
        ...(payload.title ? { title: payload.title } : {}),
        summary: payload.summary || "未命名动态",
      },
      payload.body || ""
    ),
    "utf-8"
  );
  return { id, file };
};

const writePost = async (payload) => {
  const id = safeSlug(payload.id || payload.title, `post-${Date.now()}`);
  const file = `${id}.mdx`;
  const originalId = safeSlug(payload.originalId || "");
  const tags = Array.isArray(payload.tags)
    ? payload.tags
    : String(payload.tags || "")
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);
  await mkdir(POSTS_DIR, { recursive: true });
  if (originalId && originalId !== id) {
    await rm(path.join(POSTS_DIR, `${originalId}.mdx`), { force: true });
  }
  await writeFile(
    path.join(POSTS_DIR, file),
    toFrontmatter(
      {
        title: payload.title || "未命名文章",
        description: payload.description || "",
        date: payload.date || new Date().toISOString().slice(0, 10),
        tags,
        draft: Boolean(payload.draft),
        ...(payload.cover ? { cover: payload.cover } : {}),
      },
      payload.body || ""
    ),
    "utf-8"
  );
  return { id, file };
};

const uploadGalleryImage = async (payload) => {
  const imageData = parseDataUrl(
    payload.imageDataUrl || payload.dataUrl,
    /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/u
  );
  const imageExt = imageExtFromMime(imageData.mime);
  const baseName = `${safeSlug(payload.name || "gallery-image")}-${Date.now()}`;
  const originalImagePath = path.join(GALLERY_ORIGINAL_DIR, `${baseName}.${imageExt}`);
  const fullImagePath = path.join(GALLERY_FULL_DIR, `${baseName}.jpg`);
  const thumbImagePath = path.join(GALLERY_THUMB_DIR, `${baseName}.jpg`);

  await Promise.all([
    mkdir(GALLERY_ORIGINAL_DIR, { recursive: true }),
    mkdir(GALLERY_FULL_DIR, { recursive: true }),
    mkdir(GALLERY_THUMB_DIR, { recursive: true }),
  ]);
  await writeFile(originalImagePath, imageData.buffer);
  await Promise.all([
    resizeImage(originalImagePath, fullImagePath, 1800),
    resizeImage(originalImagePath, thumbImagePath, 560),
  ]);

  const item = {
    id: safeSlug(payload.id || payload.name || baseName, baseName),
    title: payload.title || payload.alt || path.basename(payload.name || "gallery image", path.extname(payload.name || "")),
    src: publicPath(fullImagePath),
    thumbSrc: publicPath(thumbImagePath),
    fullSrc: publicPath(fullImagePath),
    originalImageSrc: publicPath(originalImagePath),
    alt: payload.alt || path.basename(payload.name || "gallery image", path.extname(payload.name || "")),
    post: payload.post || null,
    tone: "any",
    enabled: true,
    featured: false,
    order: Number(payload.order || 0),
    type: "image",
  };

  if (payload.videoDataUrl) {
    const videoData = parseDataUrl(
      payload.videoDataUrl,
      /^data:(video\/[a-zA-Z0-9.+-]+);base64,(.+)$/u
    );
    const videoExt = videoExtFromMime(videoData.mime);
    const originalVideoPath = path.join(GALLERY_ORIGINAL_DIR, `${baseName}.${videoExt}`);
    const liveVideoPath = path.join(GALLERY_LIVE_DIR, `${baseName}.mp4`);
    await Promise.all([
      mkdir(GALLERY_ORIGINAL_DIR, { recursive: true }),
      mkdir(GALLERY_LIVE_DIR, { recursive: true }),
    ]);
    await writeFile(originalVideoPath, videoData.buffer);
    await transcodeLiveVideo(originalVideoPath, liveVideoPath);
    item.liveVideoSrc = publicPath(liveVideoPath);
    item.originalVideoSrc = publicPath(originalVideoPath);
    item.type = "live";
  }

  return { ...item, item };
};

const deleteEntry = async (collection, id) => {
  const dir = collection === "posts" ? POSTS_DIR : NOW_DIR;
  const file = `${safeSlug(id)}.mdx`;
  await rm(path.join(dir, file), { force: true });
  return { id };
};

const readAll = async () => ({
  now: await readMdxDir(NOW_DIR),
  posts: await readMdxDir(POSTS_DIR),
  gallery: JSON.parse(await readFile(GALLERY_PATH, "utf-8")),
  capabilities: JSON.parse(await readFile(CAPABILITIES_PATH, "utf-8")),
});

createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") return send(res, 204, {});

    const url = new URL(req.url || "/", `http://localhost:${PORT}`);
    if (req.method === "GET" && (url.pathname === "/" || url.pathname.startsWith("/admin"))) {
      return sendText(res, 200, await readFile(ADMIN_CLIENT_PATH, "utf-8"));
    }

    if (req.method === "GET" && url.pathname.startsWith("/uploads/")) {
      return sendFile(res, path.join(PUBLIC_DIR, decodeURIComponent(url.pathname)));
    }

    if (req.method === "GET" && url.pathname === "/api/admin/content") {
      return send(res, 200, await readAll());
    }

    if (req.method === "POST" && url.pathname === "/api/admin/now") {
      return send(res, 200, await writeNow(await readBody(req)));
    }

    if (req.method === "POST" && url.pathname === "/api/admin/posts") {
      return send(res, 200, await writePost(await readBody(req)));
    }

    if (req.method === "POST" && url.pathname === "/api/admin/gallery") {
      const body = await readBody(req);
      const items = (body.items || []).map((item, index) => normalizeGalleryItem(item, index));
      await writeFile(GALLERY_PATH, `${JSON.stringify(items, null, 2)}\n`, "utf-8");
      return send(res, 200, { count: items.length });
    }

    if (req.method === "POST" && url.pathname === "/api/admin/gallery/upload") {
      return send(res, 200, await uploadGalleryImage(await readBody(req)));
    }

    if (req.method === "POST" && url.pathname === "/api/admin/capabilities") {
      const body = await readBody(req);
      await writeFile(CAPABILITIES_PATH, `${JSON.stringify(body, null, 2)}\n`, "utf-8");
      return send(res, 200, body);
    }

    if (req.method === "DELETE" && url.pathname.startsWith("/api/admin/")) {
      const [, , , collection, id] = url.pathname.split("/");
      if ((collection === "posts" || collection === "now") && id) {
        return send(res, 200, await deleteEntry(collection, decodeURIComponent(id)));
      }
    }

    return send(res, 404, { error: "Not found" });
  } catch (error) {
    return send(res, 500, { error: error instanceof Error ? error.message : String(error) });
  }
}).listen(PORT, "::1", () => {
  console.log(`Content admin ready at http://localhost:${PORT}/admin`);
});
