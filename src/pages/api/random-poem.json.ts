import type { APIRoute } from "astro";

const API_BASE = "https://poetry.palemoky.com/api/poems/random";
const allowedLangs = new Set(["zh-Hans", "zh-Hant"]);
const allowedTypes = new Set(["五言绝句", "七言绝句"]);
const maxAttempts = 8;

const fallbackPoem = {
  data: {
    id: 0,
    title: "颂平常心是道",
    content: [
      "春有百花秋有月，夏有凉风冬有雪。",
      "若无闲事挂心头，便是人间好时节。",
    ],
    author: { id: 0, name: "无门慧开禅师" },
    dynasty: { id: 0, name: "宋" },
    type: { id: 0, name: "偈颂" },
  },
  lang: "zh-Hans",
  fallback: true,
};

const cleanLine = (line: string) =>
  line
    .replace(/[，。！？；：、,.!?;:\s]+$/g, "")
    .trim();

const splitLine = (line: string) =>
  line
    .split(/[，。！？；：、,.!?;:\s]+/g)
    .map(cleanLine)
    .filter(Boolean);

const getTwoLines = (content: unknown) => {
  if (!Array.isArray(content)) return [];
  const directLines = content.map((line) => cleanLine(String(line))).filter(Boolean);
  if (directLines.length >= 2) return directLines.slice(0, 2);
  return content.flatMap((line) => splitLine(String(line))).slice(0, 2);
};

const isCleanShortPoem = (payload: any) => {
  const lines = getTwoLines(payload?.data?.content);
  if (lines.length !== 2) return false;
  return lines.every((line) => {
    const compact = line.replace(/\s/g, "");
    return (
      compact.length >= 5 &&
      compact.length <= 14 &&
      !/[()（）《》"“”]/.test(compact) &&
      !/[a-zA-Z0-9]/.test(compact)
    );
  });
};

export const GET: APIRoute = async ({ url }) => {
  const langParam = url.searchParams.get("lang") || "zh-Hans";
  const lang = allowedLangs.has(langParam) ? langParam : "zh-Hans";
  const typeParam = url.searchParams.get("type") || "";
  const remoteUrl = new URL(API_BASE);
  remoteUrl.searchParams.set("lang", lang);
  if (allowedTypes.has(typeParam)) {
    remoteUrl.searchParams.set("type", typeParam);
  }

  try {
    let payload: any = null;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const response = await fetch(remoteUrl, {
        headers: {
          accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Poetry API returned ${response.status}`);
      }

      payload = await response.json();
      if (isCleanShortPoem(payload)) break;
    }

    if (!isCleanShortPoem(payload)) {
      payload = fallbackPoem;
    }

    return new Response(JSON.stringify(payload), {
      headers: {
        "cache-control": "no-store",
        "content-type": "application/json; charset=utf-8",
      },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        ...fallbackPoem,
        lang,
        error: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 200,
        headers: {
          "cache-control": "no-store",
          "content-type": "application/json; charset=utf-8",
        },
      },
    );
  }
};
