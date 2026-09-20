import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  access,
  mkdir,
  readdir,
  readFile,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";

const execFileAsync = promisify(execFile);
const root = process.cwd();
const defaultSource = "/Users/gonghui/Desktop/imageLife";
const sourceDir = path.resolve(
  process.argv.find((argument) => argument.startsWith("--source="))?.slice("--source=".length) ||
    defaultSource,
);
const shouldWrite = process.argv.includes("--write");
const publicDir = path.join(root, "public");
const galleryDir = path.join(publicDir, "uploads", "gallery");
const thumbDir = path.join(galleryDir, "thumbs");
const fullDir = path.join(galleryDir, "full");
const liveDir = path.join(galleryDir, "live");
const galleryPath = path.join(root, "content", "gallery", "index.json");

const primaryImagePattern = /^IMG_(\d+)\.(jpe?g|png|heic|heif)$/iu;
const editedImagePattern = /^IMG_E(\d+)\.(jpe?g|png|heic|heif)$/iu;
const primaryVideoPattern = /^IMG_(\d+)\.(mov|mp4)$/iu;
const editedVideoPattern = /^IMG_E(\d+)\.(mov|mp4)$/iu;

const publicPath = (filePath) => `/${path.relative(publicDir, filePath).split(path.sep).join("/")}`;

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

async function fileHash(filePath) {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

async function readGallery() {
  try {
    const parsed = JSON.parse(await readFile(galleryPath, "utf-8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function imageMetadata(filePath) {
  let takenAt = "";
  let hasLocation = false;

  try {
    const { stdout } = await execFileAsync("sips", ["-g", "creation", filePath]);
    const value = stdout.match(/creation:\s*(\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2})/u)?.[1];
    if (value) takenAt = value.replace(/^(\d{4}):(\d{2}):(\d{2}) /u, "$1-$2-$3T");
  } catch {}

  try {
    const { stdout } = await execFileAsync("file", [filePath]);
    hasLocation = /GPS-Data/iu.test(stdout);
  } catch {}

  if (!hasLocation) {
    try {
      const buffer = await readFile(filePath);
      hasLocation =
        buffer.includes(Buffer.from("%GPS")) ||
        buffer.includes(Buffer.from("GPSLatitude")) ||
        buffer.includes(Buffer.from("GPSLongitude"));
    } catch {}
  }

  return { takenAt, hasLocation };
}

async function liveMetadata(filePath) {
  if (!filePath) return { isLive: false, takenAt: "", hasLocation: false };

  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format_tags",
      "-of",
      "json",
      filePath,
    ]);
    const tags = JSON.parse(stdout)?.format?.tags || {};
    const identifier = tags["com.apple.quicktime.content.identifier"];
    const takenAt = String(tags["com.apple.quicktime.creationdate"] || "").replace(
      /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}).*$/u,
      "$1",
    );
    return {
      isLive: Boolean(identifier),
      takenAt,
      hasLocation: Boolean(tags["com.apple.quicktime.location.ISO6709"]),
    };
  } catch {
    return { isLive: false, takenAt: "", hasLocation: false };
  }
}

function chooseSingle(paths) {
  return [...paths].sort((a, b) => a.localeCompare(b))[0] || "";
}

async function discoverItems() {
  const files = await walk(sourceDir);
  const groups = new Map();

  for (const filePath of files) {
    const name = path.basename(filePath);
    const relativeDirectory = path.relative(sourceDir, path.dirname(filePath));
    const match =
      name.match(primaryImagePattern) ||
      name.match(editedImagePattern) ||
      name.match(primaryVideoPattern) ||
      name.match(editedVideoPattern);
    if (!match) continue;

    const key = `${relativeDirectory}/${match[1]}`;
    const group = groups.get(key) || {
      key,
      number: match[1],
      primaryImages: [],
      editedImages: [],
      primaryVideos: [],
      editedVideos: [],
    };

    if (primaryImagePattern.test(name)) group.primaryImages.push(filePath);
    else if (editedImagePattern.test(name)) group.editedImages.push(filePath);
    else if (primaryVideoPattern.test(name)) group.primaryVideos.push(filePath);
    else if (editedVideoPattern.test(name)) group.editedVideos.push(filePath);
    groups.set(key, group);
  }

  return [...groups.values()]
    .filter((group) => group.primaryImages.length || group.editedImages.length)
    .sort((a, b) => a.key.localeCompare(b.key, "en", { numeric: true }));
}

async function transcodeLiveVideo(inputPath, outputPath) {
  await execFileAsync(
    "ffmpeg",
    [
      "-y",
      "-v",
      "error",
      "-i",
      inputPath,
      "-map",
      "0:v:0",
      "-vf",
      "scale='min(960,iw)':-2",
      "-c:v",
      "libx264",
      "-preset",
      "medium",
      "-crf",
      "27",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      "-an",
      outputPath,
    ],
    { maxBuffer: 20 * 1024 * 1024 },
  );
}

async function outputExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function buildImageVariant(inputPath, outputPath, maxSize, quality) {
  try {
    await sharp(inputPath)
      .rotate()
      .resize({ width: maxSize, height: maxSize, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#111111" })
      .jpeg({ quality, mozjpeg: true })
      .toFile(outputPath);
  } catch (error) {
    if (!/\.(heic|heif)$/iu.test(inputPath)) throw error;
    await execFileAsync("sips", [
      "-s",
      "format",
      "jpeg",
      "-s",
      "formatOptions",
      String(quality),
      "-Z",
      String(maxSize),
      inputPath,
      "--out",
      outputPath,
    ]);
  }
}

async function buildMedia(displayImagePath, liveVideoPath, slug) {
  const thumbPath = path.join(thumbDir, `${slug}.jpg`);
  const fullPath = path.join(fullDir, `${slug}.jpg`);
  const outputVideoPath = liveVideoPath ? path.join(liveDir, `${slug}.mp4`) : "";

  if (!(await outputExists(thumbPath))) {
    await buildImageVariant(displayImagePath, thumbPath, 560, 74);
  }

  if (!(await outputExists(fullPath))) {
    await buildImageVariant(displayImagePath, fullPath, 1600, 82);
  }

  if (liveVideoPath && !(await outputExists(outputVideoPath))) {
    await transcodeLiveVideo(liveVideoPath, outputVideoPath);
  }

  return { thumbPath, fullPath, outputVideoPath };
}

async function main() {
  await access(sourceDir);
  const groups = await discoverItems();
  const gallery = await readGallery();
  const existingHashes = new Set(gallery.map((item) => item.importHash).filter(Boolean));
  const maxOrder = gallery.reduce((maximum, item) => Math.max(maximum, Number(item.order) || 0), 0);
  const candidates = [];
  const duplicateSources = [];
  const invalidLivePairs = [];

  for (const group of groups) {
    const originalImage = chooseSingle(group.primaryImages) || chooseSingle(group.editedImages);
    const displayImage = chooseSingle(group.editedImages) || originalImage;
    const originalVideo = chooseSingle(group.primaryVideos);
    const editedVideo = chooseSingle(group.editedVideos);
    const sourceHash = await fileHash(originalImage);
    if (existingHashes.has(sourceHash)) {
      duplicateSources.push(originalImage);
      continue;
    }

    const [imageInfo, primaryLiveInfo, editedLiveInfo] = await Promise.all([
      imageMetadata(originalImage),
      liveMetadata(originalVideo),
      liveMetadata(editedVideo),
    ]);
    const liveVideo =
      editedVideo && editedLiveInfo.isLive
        ? editedVideo
        : originalVideo && primaryLiveInfo.isLive
          ? originalVideo
          : "";
    const liveInfo = liveVideo === editedVideo ? editedLiveInfo : primaryLiveInfo;
    if ((originalVideo || editedVideo) && !liveVideo) {
      invalidLivePairs.push(originalVideo || editedVideo);
    }

    candidates.push({
      group,
      originalImage,
      displayImage,
      liveVideo,
      sourceHash,
      takenAt: imageInfo.takenAt || liveInfo.takenAt,
      hasLocation: imageInfo.hasLocation || liveInfo.hasLocation,
    });
    existingHashes.add(sourceHash);
  }

  const summary = {
    source: sourceDir,
    discovered: groups.length,
    newItems: candidates.length,
    duplicates: duplicateSources.length,
    liveItems: candidates.filter((item) => item.liveVideo).length,
    withTakenAt: candidates.filter((item) => item.takenAt).length,
    withLocation: candidates.filter((item) => item.hasLocation).length,
    invalidLivePairs: invalidLivePairs.length,
    mode: shouldWrite ? "write" : "dry-run",
  };
  console.log(JSON.stringify(summary, null, 2));

  if (!shouldWrite) {
    console.log("Dry run only. Add --write to generate gallery media and update content/gallery/index.json.");
    return;
  }

  await Promise.all([mkdir(thumbDir, { recursive: true }), mkdir(fullDir, { recursive: true }), mkdir(liveDir, { recursive: true })]);
  const added = [];

  for (const [index, candidate] of candidates.entries()) {
    const slug = `life-${candidate.sourceHash.slice(0, 16)}`;
    const media = await buildMedia(candidate.displayImage, candidate.liveVideo, slug);
    added.push({
      id: slug,
      type: candidate.liveVideo ? "live" : "image",
      title: `IMG ${candidate.group.number}`,
      alt: `IMG ${candidate.group.number}`,
      description: "",
      mood: "日常",
      enabled: true,
      featured: false,
      order: maxOrder + index + 1,
      src: publicPath(media.fullPath),
      thumbSrc: publicPath(media.thumbPath),
      fullSrc: publicPath(media.fullPath),
      ...(media.outputVideoPath ? { liveVideoSrc: publicPath(media.outputVideoPath) } : {}),
      takenAt: candidate.takenAt,
      hasLocation: candidate.hasLocation,
      post: null,
      tone: "any",
      importHash: candidate.sourceHash,
    });
    console.log(`[${index + 1}/${candidates.length}] ${slug}${candidate.liveVideo ? " (live)" : ""}`);
  }

  await writeFile(galleryPath, `${JSON.stringify([...gallery, ...added], null, 2)}\n`, "utf-8");
  const [thumbSize, fullSize, liveSize] = await Promise.all(
    [thumbDir, fullDir, liveDir].map(async (directory) => {
      const files = await readdir(directory);
      const sizes = await Promise.all(files.map(async (file) => (await stat(path.join(directory, file))).size));
      return sizes.reduce((sum, size) => sum + size, 0);
    }),
  );
  console.log(
    JSON.stringify(
      {
        ...summary,
        written: added.length,
        generatedMediaMiB: Number(((thumbSize + fullSize + liveSize) / 1024 / 1024).toFixed(1)),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
