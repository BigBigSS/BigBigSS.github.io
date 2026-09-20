import { spawn } from "node:child_process";
import {
  access,
  mkdtemp,
  mkdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "playwright-core";

const WIDTH = 960;
const HEIGHT = 600;
const FPS = 24;
const DURATION_MS = 5800;
const RECORDING_MS = 6300;
const OUTPUT_DIR = resolve("public/lab-previews");
const DEFAULT_BASE_URL = "http://localhost:4321";
const CHROME_PATH =
  process.env.LAB_PREVIEW_CHROME ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const experiments = [
  {
    slug: "arbre",
    route: "/lab-effects/atelier/arbre.html",
    warmupMs: 150,
    interaction: "pointer",
  },
  {
    slug: "brick-typewriter",
    route: "/typewriter",
    warmupMs: 450,
    waitForReady: true,
    interaction: "typewriter",
  },
  {
    slug: "etude-encre",
    route: "/lab-effects/etudes/encre.html",
    warmupMs: 700,
    interaction: "pointer",
  },
  {
    slug: "etude-particules",
    route: "/lab-effects/etudes/particules.html",
    warmupMs: 800,
    interaction: "pointer",
  },
  {
    slug: "etude-type-liquide",
    route: "/lab-effects/etudes/type-liquide.html",
    warmupMs: 700,
    interaction: "pointer",
  },
  {
    slug: "golden-spiral",
    route: "/lab-effects/ohmyking/effect2-spiral.html",
    warmupMs: 250,
    interaction: "none",
  },
  {
    slug: "leaf",
    route: "/lab-effects/atelier/leaf.html",
    warmupMs: 700,
    interaction: "pointer",
  },
  {
    slug: "liquid-poster",
    route: "/lab-effects/atelier/liquid-poster.html",
    warmupMs: 700,
    interaction: "pointer-click",
  },
  {
    slug: "maison",
    route: "/lab-effects/atelier/maison.html",
    warmupMs: 800,
    interaction: "pointer-click",
  },
  {
    slug: "mechanical-cash-register",
    route: "/cash-register",
    warmupMs: 450,
    waitForReady: true,
    interaction: "cash-register",
  },
  {
    slug: "perlin-terrain",
    route: "/lab-effects/ohmyking/effect1-terrain.html",
    warmupMs: 1200,
    interaction: "orbit",
  },
  {
    slug: "poeme-transitions",
    route: "/lab-effects/atelier/poeme.html",
    warmupMs: 500,
    interaction: "none",
  },
  {
    slug: "saiyan-flush",
    route: "/saiyan-flush",
    warmupMs: 450,
    waitForReady: true,
    interaction: "saiyan",
  },
  {
    slug: "terrain-hero",
    route: "/lab-effects/atelier/terrain-hero.html",
    warmupMs: 700,
    interaction: "pointer",
  },
  {
    slug: "works-cards",
    route: "/lab-effects/ohmyking/effect3-cards.html",
    warmupMs: 1200,
    interaction: "pointer",
  },
];

const args = new Map(
  process.argv.slice(2).map((argument) => {
    const [key, ...value] = argument.replace(/^--/, "").split("=");
    return [key, value.join("=") || "true"];
  }),
);
const baseUrl = (args.get("base-url") ?? DEFAULT_BASE_URL).replace(/\/$/, "");
const selectedSlug = args.get("slug");
const skipExisting = args.get("skip-existing") === "true";
const selectedExperiments = selectedSlug
  ? experiments.filter(({ slug }) => slug === selectedSlug)
  : experiments;

if (selectedExperiments.length === 0) {
  throw new Error(`Unknown lab slug: ${selectedSlug}`);
}

const wait = (milliseconds) =>
  new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));

const run = (command, commandArgs) =>
  new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, commandArgs, { stdio: "inherit" });
    child.once("error", rejectPromise);
    child.once("exit", (code) => {
      if (code === 0) {
        resolvePromise();
      } else {
        rejectPromise(
          new Error(`${command} exited with status ${String(code)}`),
        );
      }
    });
  });

async function movePointer(page, durationMs, shouldClick) {
  const startedAt = Date.now();
  let clicked = false;

  while (Date.now() - startedAt < durationMs) {
    const progress = (Date.now() - startedAt) / durationMs;
    const angle = progress * Math.PI * 4;
    const x = WIDTH * (0.5 + Math.sin(angle) * 0.28);
    const y = HEIGHT * (0.5 + Math.sin(angle * 0.62 + 0.8) * 0.25);
    await page.mouse.move(x, y, { steps: 3 });

    if (shouldClick && !clicked && progress > 0.48) {
      clicked = true;
      await page.mouse.click(x, y);
    }
    await wait(85);
  }
}

async function runInteraction(page, interaction, durationMs) {
  if (interaction === "typewriter") {
    await page.locator('[data-action="rotate"]').click();
    await page.locator('[data-action="print"]').click();
    await wait(durationMs);
    return;
  }

  if (interaction === "cash-register") {
    await page.locator('[data-action="demo"]').click();
    await wait(durationMs);
    return;
  }

  if (interaction === "saiyan") {
    await page.locator('[data-action="demo"]').click();
    await wait(durationMs);
    return;
  }

  if (interaction === "orbit") {
    await movePointer(page, durationMs, false);
    return;
  }

  if (interaction === "pointer" || interaction === "pointer-click") {
    await movePointer(page, durationMs, interaction === "pointer-click");
    return;
  }

  await wait(durationMs);
}

async function captureFrames(page, directory, interaction) {
  const client = await page.context().newCDPSession(page);
  const samples = [];

  client.on("Page.screencastFrame", (event) => {
    samples.push({
      data: event.data,
      timestamp: event.metadata.timestamp,
    });
    void client.send("Page.screencastFrameAck", {
      sessionId: event.sessionId,
    });
  });

  await client.send("Page.startScreencast", {
    format: "jpeg",
    quality: 90,
    maxWidth: WIDTH,
    maxHeight: HEIGHT,
    everyNthFrame: 1,
  });

  await runInteraction(page, interaction, RECORDING_MS);
  await client.send("Page.stopScreencast");
  await wait(150);
  await client.detach();

  if (samples.length < FPS) {
    throw new Error(`Only captured ${samples.length} screencast frames`);
  }

  const firstTimestamp = samples[0].timestamp;
  const targetCount = Math.round((DURATION_MS / 1000) * FPS);
  let sampleIndex = 0;

  for (let frameIndex = 0; frameIndex < targetCount; frameIndex += 1) {
    const targetTimestamp = firstTimestamp + frameIndex / FPS;
    while (
      sampleIndex + 1 < samples.length &&
      samples[sampleIndex + 1].timestamp <= targetTimestamp
    ) {
      sampleIndex += 1;
    }
    const name = `frame-${String(frameIndex + 1).padStart(5, "0")}.jpg`;
    await writeFile(join(directory, name), samples[sampleIndex].data, "base64");
  }

  return { captured: samples.length, encoded: targetCount };
}

async function encodePreview(directory, slug) {
  const inputPattern = join(directory, "frame-%05d.jpg");
  const webmTemporary = join(directory, `${slug}.webm`);
  const mp4Temporary = join(directory, `${slug}.mp4`);
  const webmOutput = join(OUTPUT_DIR, `${slug}.webm`);
  const mp4Output = join(OUTPUT_DIR, `${slug}.mp4`);

  await run("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-framerate",
    String(FPS),
    "-i",
    inputPattern,
    "-an",
    "-c:v",
    "libvpx-vp9",
    "-crf",
    "34",
    "-b:v",
    "0",
    "-deadline",
    "good",
    "-cpu-used",
    "2",
    "-row-mt",
    "1",
    "-pix_fmt",
    "yuv420p",
    webmTemporary,
  ]);

  await run("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-framerate",
    String(FPS),
    "-i",
    inputPattern,
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    "slow",
    "-crf",
    "23",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    mp4Temporary,
  ]);

  await rename(webmTemporary, webmOutput);
  await rename(mp4Temporary, mp4Output);
}

await mkdir(OUTPUT_DIR, { recursive: true });

const browser = await chromium.launch({
  executablePath: CHROME_PATH,
  headless: true,
  args: [
    "--autoplay-policy=no-user-gesture-required",
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--enable-webgl",
    "--ignore-gpu-blocklist",
  ],
});

try {
  for (const experiment of selectedExperiments) {
    if (skipExisting) {
      const existingOutputs = [
        join(OUTPUT_DIR, `${experiment.slug}.webm`),
        join(OUTPUT_DIR, `${experiment.slug}.mp4`),
      ];
      const outputStates = await Promise.all(
        existingOutputs.map((output) =>
          access(output).then(
            () => true,
            () => false,
          ),
        ),
      );
      if (outputStates.every(Boolean)) {
        console.log(`\n[${experiment.slug}] skipped existing preview`);
        continue;
      }
    }

    const temporaryDirectory = await mkdtemp(
      join(tmpdir(), `lab-preview-${experiment.slug}-`),
    );
    const page = await browser.newPage({
      viewport: { width: WIDTH, height: HEIGHT },
      deviceScaleFactor: 1,
      reducedMotion: "no-preference",
    });

    try {
      const url = `${baseUrl}${experiment.route}`;
      console.log(`\n[${experiment.slug}] ${url}`);
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
      if (experiment.waitForReady) {
        await page.waitForFunction(
          () =>
            document.querySelector("[data-status]")?.textContent?.trim() ===
            "READY",
          { timeout: 30_000 },
        );
      }
      await page.waitForTimeout(experiment.warmupMs);
      const result = await captureFrames(
        page,
        temporaryDirectory,
        experiment.interaction,
      );
      await encodePreview(temporaryDirectory, experiment.slug);
      console.log(
        `[${experiment.slug}] captured ${result.captured}, encoded ${result.encoded} frames`,
      );
    } finally {
      await page.close();
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  }
} finally {
  await browser.close();
}

console.log(`\nPreview videos written to ${OUTPUT_DIR}`);
