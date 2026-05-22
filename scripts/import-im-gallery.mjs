import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = process.cwd();
const imDir = path.join(root, "im");
const publicDir = path.join(root, "public");
const galleryDir = path.join(publicDir, "uploads", "gallery");
const thumbDir = path.join(galleryDir, "thumbs");
const fullDir = path.join(galleryDir, "full");
const liveDir = path.join(galleryDir, "live");
const originalDir = path.join(galleryDir, "originals");
const galleryPath = path.join(root, "content", "gallery", "index.json");

const imagePattern = /\.(jpe?g|png|webp|heic|heif)$/iu;
const videoPattern = /\.(mov|mp4)$/iu;

const publicPath = (filePath) => `/${path.relative(publicDir, filePath).split(path.sep).join("/")}`;

const safeSlug = (value, fallback = "gallery") => {
  const slug = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\.[^.]+$/u, "")
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9\u4e00-\u9fa5-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || fallback;
};

const fileHash = async (filePath) =>
  createHash("sha256").update(await readFile(filePath)).digest("hex");

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

const transcodeVideo = async (inputPath, outputPath) => {
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

const uniqueOutputPath = (directory, baseName, ext) => {
  const suffix = ext.startsWith(".") ? ext : `.${ext}`;
  return path.join(directory, `${baseName}${suffix}`);
};

const readGallery = async () => {
  try {
    const parsed = JSON.parse(await readFile(galleryPath, "utf-8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const main = async () => {
  await Promise.all([
    mkdir(thumbDir, { recursive: true }),
    mkdir(fullDir, { recursive: true }),
    mkdir(liveDir, { recursive: true }),
    mkdir(originalDir, { recursive: true }),
  ]);

  const entries = await readdir(imDir, { withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
  const imageFiles = files.filter((file) => imagePattern.test(file)).sort((a, b) => a.localeCompare(b));
  const videoFiles = files.filter((file) => videoPattern.test(file)).sort((a, b) => a.localeCompare(b));
  const videosByNormalizedBase = new Map(
    videoFiles.map((file) => [safeSlug(file).replace(/-\d+$/u, ""), file])
  );

  const gallery = await readGallery();
  const existingKeys = new Set(
    gallery.map((item) => item.importHash || item.src || item.fullSrc).filter(Boolean)
  );

  const seenHashes = new Set(gallery.map((item) => item.importHash).filter(Boolean));
  try {
    const originalFiles = (await readdir(originalDir, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && imagePattern.test(entry.name))
      .map((entry) => path.join(originalDir, entry.name));
    for (const originalFile of originalFiles) {
      seenHashes.add(await fileHash(originalFile));
    }
  } catch {}
  const added = [];
  let skippedDuplicates = 0;

  for (const file of imageFiles) {
    const sourcePath = path.join(imDir, file);
    const hash = await fileHash(sourcePath);
    if (seenHashes.has(hash)) {
      skippedDuplicates += 1;
      continue;
    }

    const baseName = safeSlug(file);
    const originalPath = uniqueOutputPath(originalDir, baseName, path.extname(file).toLowerCase() || ".jpg");
    const thumbPath = uniqueOutputPath(thumbDir, baseName, ".jpg");
    const fullPath = uniqueOutputPath(fullDir, baseName, ".jpg");

    await writeFile(originalPath, await readFile(sourcePath));
    await Promise.all([
      resizeImage(originalPath, fullPath, 1800),
      resizeImage(originalPath, thumbPath, 560),
    ]);

    const normalizedBase = baseName.replace(/-\d+$/u, "");
    const videoFile = videosByNormalizedBase.get(normalizedBase);
    const item = {
      src: publicPath(fullPath),
      thumbSrc: publicPath(thumbPath),
      fullSrc: publicPath(fullPath),
      alt: baseName.replace(/-/g, " ").toUpperCase(),
      post: null,
      tone: "any",
      type: "image",
      importHash: hash,
    };

    if (videoFile) {
      const sourceVideoPath = path.join(imDir, videoFile);
      const originalVideoPath = uniqueOutputPath(originalDir, normalizedBase, path.extname(videoFile).toLowerCase());
      const liveVideoPath = uniqueOutputPath(liveDir, normalizedBase, ".mp4");
      await writeFile(originalVideoPath, await readFile(sourceVideoPath));
      await transcodeVideo(originalVideoPath, liveVideoPath);
      item.liveVideoSrc = publicPath(liveVideoPath);
      item.originalVideoSrc = publicPath(originalVideoPath);
      item.type = "live";
    }

    if (!existingKeys.has(item.importHash) && !existingKeys.has(item.fullSrc)) {
      added.push(item);
      seenHashes.add(hash);
    }
  }

  const nextGallery = [...added, ...gallery];
  await writeFile(galleryPath, `${JSON.stringify(nextGallery, null, 2)}\n`, "utf-8");
  console.log(`Imported ${added.length} gallery items from im; skipped ${skippedDuplicates} duplicate image files.`);
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
