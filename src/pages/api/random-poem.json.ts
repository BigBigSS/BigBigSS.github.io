import type { APIRoute } from "astro";

// 静态站点：该接口在构建时预渲染成一个静态 JSON 文件。
// 因此不能在运行时按需取随机诗（上游 API 也没有 CORS 头，浏览器无法直接调）。
// 方案：构建时一次性抓取一批干净短诗写入静态文件，客户端只拉一次、之后在本地随机切换。
export const prerender = true;

const API_BASE = "https://poetry.palemoky.com/api/poems/random";
const LANG = "zh-Hans";
const TYPES = ["五言绝句", "七言绝句"];
const TARGET_POOL = 24; // 目标池大小（上游会有长诗/重复，需多抓）
const FETCH_ATTEMPTS = 36;

// 本地兜底诗库：即使构建时无网络/上游故障，也保证有足够数量可持续切换。
const localPoems: string[][] = [
  ["行到水穷处", "坐看云起时"],
  ["山中何所有", "岭上多白云"],
  ["春有百花秋有月", "夏有凉风冬有雪"],
  ["空山新雨后", "天气晚来秋"],
  ["大漠孤烟直", "长河落日圆"],
  ["欲穷千里目", "更上一层楼"],
  ["野旷天低树", "江清月近人"],
  ["海上生明月", "天涯共此时"],
  ["明月松间照", "清泉石上流"],
  ["人闲桂花落", "夜静春山空"],
  ["独坐幽篁里", "弹琴复长啸"],
  ["返景入深林", "复照青苔上"],
  ["白日依山尽", "黄河入海流"],
  ["千山鸟飞绝", "万径人踪灭"],
  ["相看两不厌", "只有敬亭山"],
  ["举头望明月", "低头思故乡"],
];

const cleanLine = (line: string) =>
  line.replace(/[，。！？；：、,.!?;:\s]+$/g, "").trim();

const splitLine = (line: string) =>
  line.split(/[，。！？；：、,.!?;:\s]+/g).map(cleanLine).filter(Boolean);

const getTwoLines = (content: unknown): string[] => {
  if (!Array.isArray(content)) return [];
  const direct = content.map((l) => cleanLine(String(l))).filter(Boolean);
  if (direct.length >= 2) return direct.slice(0, 2);
  return content.flatMap((l) => splitLine(String(l))).slice(0, 2);
};

const isCleanShort = (lines: string[]) =>
  lines.length === 2 &&
  lines.every((line) => {
    const c = line.replace(/\s/g, "");
    return (
      c.length >= 5 &&
      c.length <= 14 &&
      !/[()（）《》"“”]/.test(c) &&
      !/[a-zA-Z0-9]/.test(c)
    );
  });

const fetchOne = async (): Promise<string[] | null> => {
  try {
    const url = new URL(API_BASE);
    url.searchParams.set("lang", LANG);
    url.searchParams.set("type", TYPES[Math.floor(Math.random() * TYPES.length)]);
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) return null;
    const payload: any = await res.json();
    const lines = getTwoLines(payload?.data?.content);
    return isCleanShort(lines) ? lines : null;
  } catch {
    return null;
  }
};

export const GET: APIRoute = async () => {
  const collected = new Map<string, string[]>();
  for (const p of localPoems) collected.set(p.join("|"), p);

  try {
    const results = await Promise.all(
      Array.from({ length: FETCH_ATTEMPTS }, () => fetchOne()),
    );
    for (const lines of results) {
      if (!lines) continue;
      collected.set(lines.join("|"), lines);
      if (collected.size >= TARGET_POOL + localPoems.length) break;
    }
  } catch {
    /* 构建时网络失败：静默回退到本地池 */
  }

  const poems = Array.from(collected.values());

  return new Response(JSON.stringify({ poems, count: poems.length }), {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
};
