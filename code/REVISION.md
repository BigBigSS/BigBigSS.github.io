# REVISION.md — v0.3 视觉效果修正指南

> 针对当前本地版本（http://127.0.0.1:4321/）与参考站（kaopu-xiaopu.github.io/web-design）之间的差距，给出**诊断 + 修复方案 + 可直接落地的代码片段**。

---

## 一、差距诊断

### 1.1 Hero — 你看到的 vs 参考

| | 现状（x1.jpg） | 参考（1.png） |
|---|---|---|
| 彩虹形态 | **单点放射的圆形光团**，像一滴颜料扩散 | **并排的 7 条波浪形彩带**，像七块玻璃竖着插在台面上 |
| 颜色关系 | 颜色互相渗透、融合 | 每条带**独立一色**，边界清晰但柔化 |
| 位置 | 屏幕正中偏右的圆 | 从屏幕中部偏左**一直延伸到右边缘**的竖向带群 |
| 视觉感 | "一团光" | "一排彩色的羽毛 / 厚玻璃" |

**根因（看 HeroSpotlight.astro）**：
- **L121-137** 用了单点 `conic-gradient from 145deg at 72% 36%` → 这是**饼图放射状**，天然只能产生圆弧，永远不会变成"竖向波浪带"
- **L152-162** 的 mask 用 `radial-gradient(circle 640px)` → 圆形打孔，强化了"球"的感觉
- **L139-150** 的 `hero__bands` 只是叠了一层透明度很低的深色条纹，没有真正的彩色带

**一句话**：你现在是"一个点向外发散彩虹"，参考是"7 条独立的彩色竖带并列站着"。**这是两种完全不同的几何结构**，blur 再多也救不回来。

---

### 1.2 ImageBarrel — 你看到的 vs 参考

| | 现状（x3.jpg） | 参考（3.png） |
|---|---|---|
| 形状 | **5~6 条竖直"条带"** 中间露出大片黑色 | 一只**饱满、紧实**的球形/桶形，表面几乎全是图片 |
| 密度 | 约 60 张，稀疏可以看穿 | 视觉上 150~250+ 张，完全覆盖曲面 |
| 弯曲 | 近乎直桶（只有轻微 rotateX -6°） | 明显的**球面鼓起**，中间最宽、两端收窄 |
| 感觉 | 像拉开的百叶窗 | 像一颗地球 |

**根因（看 ImageBarrel.astro）**：
- **L26-29**：`column = i % 10` / `row = floor(i / 10)` → 10 列 6 行 = 60 张
- **L34**：`--angle: ${column * 36}deg` → **每张卡间隔 36°**，在半径 480px 下，**两张卡中心弧长 ≈ 300px**，而卡宽只有 120px → **中间必然留 180px 空隙**，这就是你看到的"条带"的由来
- **L171**：`rotateX(-6deg)` 太轻，没有球面鼓起
- 没有按行变化半径 → 直桶不是球

**一句话**：**列数太少 + 卡距太大** 造成稀疏，**无行向半径变化** 造成不饱满。是参数问题，不是架构问题。

---

## 二、修复方案

### 2.1 Hero — 从"圆光团"改成"七条波浪彩带"

有两种实现路径，选 **A**（简单、纯 CSS、效果足够接近）即可；**B** 是进阶版。

#### 方案 A：7 条倾斜椭圆 + 高斯模糊（推荐）

每条"彩带"本质是一个**瘦高的椭圆**（`border-radius: 50%`），微微旋转，堆在彩虹区域里，强模糊让边缘柔化成"波浪感"。

**替换 HeroSpotlight.astro 的结构（L6-11）为：**

```astro
<div class="hero__surface" data-spotlight-root>
  <div class="hero__ribbons" aria-hidden="true">
    <span class="hero__ribbon hero__ribbon--1"></span>
    <span class="hero__ribbon hero__ribbon--2"></span>
    <span class="hero__ribbon hero__ribbon--3"></span>
    <span class="hero__ribbon hero__ribbon--4"></span>
    <span class="hero__ribbon hero__ribbon--5"></span>
    <span class="hero__ribbon hero__ribbon--6"></span>
    <span class="hero__ribbon hero__ribbon--7"></span>
  </div>
  <div class="hero__glow" aria-hidden="true"></div>
  <div class="hero__mask" aria-hidden="true"></div>
  <div class="hero__noise" aria-hidden="true"></div>
  …（保持 hero__inner 不变）
</div>
```

**替换 CSS（删除旧的 `.hero__spectrum` 和 `.hero__bands`，改为）：**

```css
/* 彩带容器 */
.hero__ribbons {
  position: absolute;
  inset: 0;
  /* 参考站点是"从左下往右上"分布彩带，这里也这么做 */
  transform: translateX(8%) translateY(-4%);
}

/* 每条彩带：瘦高椭圆，强模糊，独立一色 */
.hero__ribbon {
  position: absolute;
  top: -12%;
  height: 124%;
  width: 18%;
  border-radius: 50%;
  filter: blur(64px) saturate(1.2);
  opacity: 0.85;
  mix-blend-mode: screen;
  transform-origin: center;
}

/* 从左往右 7 条，颜色+位置+倾角各不同 */
.hero__ribbon--1 { background: var(--spectrum-1); left: 30%; transform: rotate(-8deg) scaleY(1.05); }
.hero__ribbon--2 { background: var(--spectrum-2); left: 40%; transform: rotate(-5deg) scaleY(1.1); }
.hero__ribbon--3 { background: var(--spectrum-3); left: 50%; transform: rotate(-2deg) scaleY(1.08); }
.hero__ribbon--4 { background: var(--spectrum-4); left: 60%; transform: rotate( 1deg) scaleY(1.12); }
.hero__ribbon--5 { background: var(--spectrum-5); left: 70%; transform: rotate( 4deg) scaleY(1.06); }
.hero__ribbon--6 { background: var(--spectrum-6); left: 80%; transform: rotate( 7deg) scaleY(1.1); }
.hero__ribbon--7 { background: var(--spectrum-7); left: 90%; transform: rotate(10deg) scaleY(1.08); }

/* 整体发光：让彩带有"发亮"感 */
.hero__glow {
  background:
    radial-gradient(ellipse 60% 90% at 78% 50%, rgba(255,255,255,0.12), transparent 60%);
  mix-blend-mode: screen;
  z-index: 1;
}

/* 遮罩：关键改动 — 从"圆形打孔" 改为 "左侧永远黑 + 鼠标处局部提亮" */
.hero__mask {
  background:
    /* 整体左侧黑色渐变，让彩带"只露右半" */
    linear-gradient(90deg,
      rgba(0,0,0,0.96) 0%,
      rgba(0,0,0,0.78) 22%,
      rgba(0,0,0,0.32) 48%,
      rgba(0,0,0,0.12) 68%,
      rgba(0,0,0,0.0) 100%),
    /* 鼠标位置的圆形"增亮"——反色 mask，用 lighten 模式 */
    radial-gradient(circle 520px at var(--mx) var(--my),
      rgba(0,0,0,0.0) 0%,
      rgba(0,0,0,0.12) 40%,
      rgba(0,0,0,0.36) 78%);
  z-index: 2;
}
```

**要点解释：**
1. 每条彩带是一个**椭圆**，因为 `border-radius: 50%` + 高宽比 7:1 的 span，自然成了"竖向 lens 形"
2. `filter: blur(64px)` 让边缘彻底柔化，形成"波浪感"
3. `mix-blend-mode: screen` 让两条带重叠时颜色**相加**（亮化），而不是互相遮挡
4. 每条带略微旋转不同角度（-8° → +10°），模拟参考的"扇形铺开"
5. mask 的核心不再是"打一个洞"，而是**左侧彻底变黑 + 鼠标处略微提亮**，这才是参考的感觉

#### 方案 B（进阶）：SVG 路径精确绘制
如果想要**精确的参考站点那种带波浪弧边**，用 7 条 `<path>` SVG 曲线。更还原但工作量 3 倍。当前方案 A 已经够接近。先用 A，不够再升 B。

---

### 2.2 ImageBarrel — 从"稀疏百叶窗"改成"饱满地球"

**核心改三件事：列加密、行加多、加球面鼓起。**

#### 改动 1：列数 10 → 20，行数 6 → 10（总 200 张）

替换 `ImageBarrel.astro` L10-11 和 L26-46 为：

```astro
---
import SectionHeading from "./SectionHeading.astro";
import type { GalleryItem } from "../lib/gallery";

interface Props {
  items: GalleryItem[];
}

const { items } = Astro.props;
const COLS = 20;
const ROWS = 10;
const TOTAL = COLS * ROWS; // 200
// 图不够就循环复用
const barrelItems = Array.from({ length: TOTAL }, (_, i) => items[i % items.length]);
---

<!-- template 内 -->
<div class="barrel__scene" data-barrel-stage>
  {
    barrelItems.map((item, index) => {
      const col = index % COLS;
      const row = Math.floor(index / COLS);
      // 行号归一化到 -1 ~ +1（顶行 -1，底行 +1，中间 0）
      const rowNorm = (row - (ROWS - 1) / 2) / ((ROWS - 1) / 2);
      // 球面公式：中间行半径最大，两端收窄
      const radiusScale = Math.cos(rowNorm * 0.65);  // 0.65 控制鼓起强度
      const radius = 520 * radiusScale;
      const y = rowNorm * 380;  // 行间距
      const angle = col * (360 / COLS);
      // 越靠两端的行，图片略微倾斜，增强球面感
      const tilt = rowNorm * 22;

      return (
        <figure
          class="barrel__tile"
          style={`--angle: ${angle}deg; --y: ${y}px; --r: ${radius}px; --tilt: ${tilt}deg;`}
        >
          <img
            src={item.src}
            alt={item.alt}
            loading="lazy"
            width="120"
            height="160"
          />
        </figure>
      );
    })
  }
</div>
```

#### 改动 2：tile 的 transform 用新变量

替换 `ImageBarrel.astro` CSS 中 `.barrel__tile` 的 transform（L181-184）为：

```css
.barrel__tile {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 120px;
  height: 160px;
  margin: -80px 0 0 -60px;
  transform:
    rotateY(var(--angle))
    translateZ(var(--r))     /* 用每行独立的半径 → 球面鼓起 */
    translateY(var(--y))
    rotateX(var(--tilt));    /* 顶/底行略微仰/俯视 → 更立体 */
  transform-style: preserve-3d;
  transition:
    transform 240ms ease,
    filter 240ms ease;
  backface-visibility: hidden;  /* 背面的卡不显示，避免视觉噪音 */
}
```

#### 改动 3：视口 + 场景初始姿态（让球面可见）

替换 L158-172 为：

```css
.barrel__viewport {
  position: relative;
  height: 820px;
  perspective: 1800px;
}

.barrel__scene {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 0;
  height: 0;
  transform-style: preserve-3d;
  /* 初始倾斜：让看到的是球面从正面略微往下俯视的角度 */
  transform: translateZ(-120px) rotateX(-10deg) rotateY(-18deg);
}
```

同步修改 render 函数（L85）：
```ts
const render = () => {
  stage.style.transform = `translateZ(-120px) rotateX(-10deg) rotateY(${rotation}deg)`;
};
```

#### 改动 4：性能预算守护

200 张图 × 120×160px 如果用默认分辨率的 picsum，总大小会爆掉。**必须用 `&w=120` 或 Astro 的 `<Image>` 优化**。先改生成脚本 `scripts/generate-gallery.mjs`：让占位图 URL 为 `https://picsum.photos/seed/{n}/120/160`（已经是小图）即可。

如果 200 张还卡，降级方案：
- **COLS=18, ROWS=9 = 162 张**（开球状已经足够密）
- **COLS=16, ROWS=8 = 128 张**（保底）

---

## 三、执行顺序

| 步骤 | 动作 | 文件 | 预计行数 |
|---|---|---|---|
| 1 | Hero 结构替换 | `src/components/HeroSpotlight.astro` L6-11 | 改 6 行 |
| 2 | Hero CSS 替换 | 同上 L121-162 | 删 40 行，加 55 行 |
| 3 | Barrel 列行改 20×10 | `src/components/ImageBarrel.astro` L10-46 | 改 20 行 |
| 4 | Barrel tile transform | 同上 L181-184 | 改 5 行 |
| 5 | Barrel viewport + scene | 同上 L158-172 + L85 | 改 6 行 |
| 6 | 验证 | 浏览器 http://127.0.0.1:4321/ | — |

**验证要点：**
- Hero：鼠标在屏幕左侧时应能看到"左黑 + 右半边彩带若隐若现"；鼠标移到右侧时彩带整体变亮、清晰
- Hero：单独看不到明显的"圆"，而应该看到**竖向、柔和、并排的色带**
- Barrel：不应再看到成片的黑色空隙，图片应该**均匀覆盖**一个鼓起的球面
- Barrel：中间一圈的图应该明显更大/更近，顶部和底部的图应该略小/略远

---

## 四、要不要我直接上手改？

你有两种选择：

**A. 你自己照这份文档改**
  我已经把所有要替换的代码块都贴出来了，可以直接复制粘贴到对应文件的对应行。

**B. 让我直接动手**
  我读取现有文件，精准替换代码，改完你 F5 刷新看效果。如果第一轮不到位，我再迭代。

推荐 **B**，更快。如果选 B，告诉我一声我就开始。

---

## 五、还想提醒的两件事

1. **Coverflow（x2.jpg）**你没提不满，我**不动它**。当前状态是合格的。
2. **方案 A 的彩带效果**在截图上可能没有参考那么"锐利"——因为参考用的是真正的 SVG 波浪路径。如果方案 A 做完你觉得还差点意思，我们再上 SVG 精雕版（方案 B）。

---

## 六、全站评审（新增 · 我自己找的问题）

把 `src/` 下所有文件通读一遍后，除了 Hero 和 Barrel，还有一批其他地方我也不满意。按**影响面 P0 → P5** 排。

---

### P0 — 让整体调性"立不住"的结构问题（必须改）

#### P0-1 · body 有两个莫名其妙的紫+粉色斑
**文件**：`src/styles/global.css:63-66`
```css
body {
  background:
    radial-gradient(circle at top, rgba(99, 102, 241, 0.1), transparent 28%),
    radial-gradient(circle at 80% 0%, rgba(236, 72, 153, 0.08), transparent 24%),
    var(--bg);
}
```
浅色主题下，页面顶部会看到两团模糊的紫色和粉色，像脏玻璃。Hero 本身已经是彩虹区，body 还叠一层色斑 → 视觉层数爆炸。
**修复**：删除这两行 radial-gradient，body 只留 `var(--bg)`。或者把色斑改成仅深色主题下出现。

#### P0-2 · NavBar 是"悬浮胶囊" → 和博客调性不搭
**文件**：`src/components/NavBar.astro:62-96`
现状：NavBar 是一个居中、圆角 999px 的悬浮胶囊，带 border + shadow。这是**作品集 / landing page** 的语言，不是**博客**的语言。参考站点是贴顶平直 header，左右两端分布，之间有一条细分割线或纯净留白。
**修复**：改成贴顶 `position: fixed; top: 0; left: 0; right: 0;`，无圆角、无 border，背景 `var(--bg)/85 + blur(16px)`，底部一条 1px 分割线。

#### P0-3 · "双主题"名不副实 — 三个视觉区永远是深色
**文件**：`HeroSpotlight.astro`、`PostCarousel3D.astro`、`ImageBarrel.astro` 全体
现象：浅色主题打开后，用户看到"白 → 黑 → 白 → 黑 → 白"五层明暗交替的巧克力夹心。因为 Hero 用 `bg-deep`、Carousel 用 `rgba(10,11,14)` 底、Barrel 用 `rgba(6,7,12)` 底。
**决策二选一**：
- A. **明确只做深色主题**，删掉 `:root` 的浅色变量，ThemeToggle 移除。更诚实。
- B. **真做浅色版本**：Hero 浅色主题下背景从 bg-deep 改成 `#f6f5f3`，彩带换成低饱和版本（比如从 `#ff6b3d` 换到 `#fb923c` + opacity 降到 0.6）；Carousel/Barrel 浅色底改 `rgba(250,250,245,0.96)`，卡片用浅色玻璃拟态。

**推荐 A**（更匹配参考站点调性，ThemeToggle 可以当彩蛋保留做"强制切换"但不改底色）。

#### P0-4 · Hero 被"框起来"像张贴纸
**文件**：`HeroSpotlight.astro:105-111`
```css
.hero__surface {
  border-radius: 40px;    /* ← 圆角让它变成"卡片" */
  min-height: min(860px, calc(100dvh - 104px));  /* ← 被减去的 104px 是 nav 空隙 */
  box-shadow: var(--shadow-hard);  /* ← 还自带阴影 */
}
```
参考站点 Hero 是**贯穿屏幕边缘、全屏 100vh** 的深色幕布，没有外框也没有阴影。
**修复**：删掉 border-radius、删掉 box-shadow，min-height 改成 `100dvh`，`.hero` 外壳的 `padding-top` 也去掉（让 NavBar 漂浮在 Hero 上方，Hero 从页面顶 0px 开始）。

#### P0-5 · Carousel 和 Barrel 被"外壳盒子"装起来
**文件**：`PostCarousel3D.astro:154-166`、`ImageBarrel.astro:144-156`
两个 3D 组件都裹在一个 `border-radius: 40px` + `padding: 34px` + `radial-gradient` 背景 + shadow 的"外壳 div"里。**等于把立体效果关进了卡片里**。参考站点这两个组件都是**贴到视口左右边缘**、无外框的。
**修复**：去掉 `.carousel__surface` 和 `.barrel__surface` 的 border/padding/background/shadow，只保留 `position: relative` + `overflow: hidden`；让 3D 透视直接铺到屏幕边缘。

---

### P1 — 视觉细节瑕疵

#### P1-1 · Primary 按钮用了三色彩虹渐变 → 和 Hero 背景重复
**文件**：`global.css:227-232`
现状：按钮本身是 `linear-gradient(120deg, spectrum-4, spectrum-5, spectrum-6)`，在彩虹 Hero 前面又彩虹一次。
**修复**：Primary 按钮改成**纯色填充**（比如 `var(--accent)` 或纯白），靠背景的彩色来衬托。参考站点"Install now"是纯薄荷绿。

#### P1-2 · PostCard 右上角一个模糊色球
**文件**：`PostCard.astro:37-47`
```css
.post-card::before {
  inset: -35% 40% auto auto;
  background: color-mix(in srgb, var(--card-accent) 24%, transparent);
  filter: blur(16px);
}
```
每张文章卡右上角都会出现一个彩色模糊光斑，不同卡不同颜色，网格排开视觉非常花。设计规范里没写这个。
**修复**：整段 `::before` 删除。

#### P1-3 · /now 的时间线卡右上角发光小圆点
**文件**：`now.astro:61-70`
```css
.timeline-card::before {
  width: 12px; height: 12px;
  background: var(--accent);
  box-shadow: 0 0 18px rgba(99, 102, 241, 0.42);
}
```
每张 now 卡右上角都有一个发光小点。语义不明（不是"未读"、"重要"、"分类"任何标记），只是装饰。
**修复**：删除 `::before`，或者把它改成"按 tag 分类的彩色圆点"让它有语义。

#### P1-4 · Carousel 和 Barrel 的背景光晕颜色**不统一**
**现状**：
- Carousel 背景：`rgba(16,185,129)` 绿 + `rgba(249,115,22)` 橙
- Barrel 背景：`rgba(99,102,241)` 紫 + `rgba(34,211,238)` 青

两个组件背景光晕完全对不上。既然都是 spectrum，就应该从同一套 token 里取色。
**修复**：两个组件都用 `var(--spectrum-5)` + `var(--spectrum-3)` 的组合，保持统一。

#### P1-5 · surface-card 叠了 4 层半透明 + blur + shadow
**文件**：`global.css:147-161`
```css
.surface-card {
  border + background gradient + bg-elevated + shadow-soft + backdrop-filter:blur(24px)
}
```
在彩虹 Hero + 彩色 body 底色下，半透明的 surface-card 看起来像一层结了水的果冻。
**修复**：浅色主题下改成**纯白 + 1px 淡 border + 小 shadow**，删掉 linear-gradient 和 backdrop-filter。

#### P1-6 · Hero 底部三个 pill（backend systems / AI workflows / quiet notes）
**文件**：`HeroSpotlight.astro:28-32`
不是 tag（没有链接）、不是导航、不是 meta。功能模糊，占位感极强。
**修复**：要么删掉，要么改成一句陈述（例："Now focusing on: 分布式系统 · AI 工程化"），要么改成 3 个真正的 mini card（"最新文章" / "最新动态" / "图片墙"）作为 Hero 入口。

#### P1-7 · NavBar brand mark 是彩虹渐变小方块
**文件**：`NavBar.astro:106-115`
左上角站名前的小图标用了 `linear-gradient(spectrum-2 → spectrum-5)`。和 Hero 彩虹重复。
**修复**：改成单色圆点（`var(--accent)`）+ 首字母 "L"，或者纯粹一个实心方块。

---

### P2 — 文案 & 信息层级

#### P2-1 · 所有 section 标题都是文学化长句 → 连读 4 句像读诗集
现状：
> "立体感只是外层，真正想保留下来的是思考的温度。"
> "短一点的状态，给长一点的写作透口气。"
> "把文章做成一组会呼吸的实体卡片。"
> "图片不是附属品，它们自己转成了一只记忆的桶。"

单句都好，连在一起就像一个 AI 写的诗集。参考站点每个 section 标题都是**功能性短语**（"What's inside", "How it works", "Made with this SKILL"）。
**修复**：保留 1-2 个"漂亮句"作为高光（比如 Hero 和 Gallery），其他改成直白短标题：
- About → "关于我"
- Now → "最近"
- Writing → "写作"
- Gallery → 保留文学句

#### P2-2 · Eyebrow 英文 uppercase + 标题中文 → 风格分裂
"04 / WRITING" 的国际科技 landing page 风，跟下面的中文长句不搭。
**修复**：eyebrow 改成更低调的灰色小写（`04 / writing`），或把 label 也中文化（`04 / 写作`）。选一种风格贯彻。

#### P2-3 · /gallery 独立页标题"完整图片墙"朴素到突兀
其他 section 都在堆砌长句，Gallery 独立页突然四个字。风格断裂。
**修复**：配合 P2-1 的统一方向一起改。

#### P2-4 · section_lead 的语气和 title 打架
`SectionHeading` 的 lead 是技术说明（"桌面端是会自动轮转的 3D coverflow..."），但 title 是诗句。说明书和散文在同一段出现。
**修复**：lead 改成和 title 同一语气，或完全删掉 lead（参考站点很多 section 只有 title 没有 lead）。

---

### P3 — 交互与动画

#### P3-1 · 全局 data-reveal 滚动动画 → 页面加载时满屏 jitter
**文件**：`global.css:286-297` + `BaseLayout.astro:51-78`
每个 section、每张卡都有 `opacity:0 → 1` + `translateY(28px) → 0` 的滚动触发。用户每次滚一屏都会看到一排元素"先消失再浮上来"。参考站点完全没有这种效果。
**修复**：**整套 reveal 系统移除**（删除 global.css 的 `[data-reveal]` 规则、删除 BaseLayout 的 `revealScript`、删除各组件的 `data-reveal` 属性）。只保留 Hero 的首屏进场动画一次。

#### P3-2 · ThemeToggle 只有两态，DESIGN.md 要求三态
**文件**：`ThemeToggle.astro:37-39`
现状：`window.__setTheme(current === "dark" ? "light" : "dark")`，点一下循环 light↔dark。
**修复**：
- 方案 A（跟 DESIGN.md）：改三态循环 light → dark → system，图标变 3 个
- 方案 B（务实）：保留两态，更新 DESIGN.md §7.6 去掉 system 需求

推荐 B。三态对博客过度设计。

#### P3-3 · Coverflow 是"离散跳步"但 hint 说 "steer"（方向控制）
**文件**：`PostCarousel3D.astro:128-138`
```js
if (Math.abs(delta) > 78) { step(delta > 0 ? -1 : 1); }
```
拖 78 像素才跳一格，实际体验是"生硬跳"，不是 steer。hint 文案 `Drag to steer · Hover to pause` 说错了。
**修复**：
- 方案 A（改交互）：把离散 step 换成连续 `rotation += delta * 0.3`，真跟手。
- 方案 B（改文案）：hint 改成 `Drag to flip · Hover to pause`，不骗人。

推荐 A。

#### P3-4 · Coverflow 自动间隔 4800ms → 节奏感差
每 4.8s 跳一次，中间 4.18s 完全静止，用户容易以为"坏了"。
**修复**：要么改连续缓慢平移（像旋转木马，60s 一圈），要么把间隔降到 2.5s。

#### P3-5 · Barrel 有"最低速度地板" → 永远停不下来
**文件**：`ImageBarrel.astro:91-94`
```js
velocity *= 0.994;
if (Math.abs(velocity) < 0.03) velocity = 0.03;
```
这个写法让用户拖完之后，barrel 永远以 0.03 的速度继续转，不会真正静止。
**修复**：取消"最低地板"，改成**默认低速 0.05 持续旋转**（自然的"转起来"感），用户拖拽临时改变速度，松手后缓慢回到默认 0.05。

---

### P4 — 子页 & 边角

#### P4-1 · /now 的 `h3` 在 title 缺失时显示 summary 全文
**文件**：`now.astro:35`
```astro
<h3>{entry.data.title ?? entry.data.summary}</h3>
<p class="timeline-card__summary">{entry.data.summary}</p>
```
如果某天忘了写 title，h3 和 p 会显示同一段文字。
**修复**：
```astro
{entry.data.title && <h3>{entry.data.title}</h3>}
<p class="timeline-card__summary">{entry.data.summary}</p>
```

#### P4-2 · /gallery 独立页和首页 Barrel 完全没有视觉衔接
从首页 3D 桶点进 gallery，看到的是平铺瀑布流。交互预期断裂。
**修复**：独立页顶部加一个 mini barrel（尺寸减半、更慢），或者做一个"桶展开为网格"的过渡动画（进入页面时图片从 3D 散开到 2D）。

#### P4-3 · /posts 列表页就是普通网格，没有 feature post
对比首页的 Coverflow，独立页缺少亮点。
**修复**：最新一篇做成 feature card（2 倍宽 + 大标题 + 配图），其余按 3 列普通 card。

#### P4-4 · Footer 单薄
**文件**：`Footer.astro:7-13`
只有 "© 2026 · Quiet code. Loud ideas." + GitHub/Email/RSS 三链接。
**修复**：加一行"Built with Astro · Source on GitHub · Last updated {buildDate}"，或者加 4 列次级导航（写作 / 动态 / 图片 / 关于）。

---

### P5 — 体验 / 性能小缺口

#### P5-1 · `main { padding-top: calc(nav + 24px) }` → Hero 紧贴 NavBar 没空气
**文件**：`global.css:110-112`
24px 两不靠。要么让 Hero 压在 NavBar 下（NavBar 透出 Hero 彩虹），要么 Hero 顶留 80-120px 明显呼吸。
**修复**：配合 P0-4，Hero min-height=100dvh，`main` 的 padding-top 改为 0，让 Hero 顶到屏幕。

#### P5-2 · LCP 候选图片没有 preload
Barrel 的前 12 张图、Coverflow 的第 1 张卡背景是 above-the-fold 的大图。需要 `<link rel="preload">`。
**修复**：在 BaseLayout head 中为首屏图片加 preload。

#### P5-3 · getGalleryItems 被主页和独立页分别调用
首页 slice(60)，独立页全量。生成逻辑可以一次做完缓存。
**修复**：在 `src/lib/gallery.ts` 里把结果缓存为模块级 Promise，重复调用直接复用。

---

## 七、建议修改批次与验收节点

把所有问题打包成 6 个批次，按**视觉冲击 → 调性 → 细节 → 交互**的顺序上：

| 批次 | 内容 | 预计工作量 | 验收点 |
|---|---|---|---|
| **B1** | Hero 彩带 + Barrel 稠密（§二） | 2h | 核心视觉到位 |
| **B2** | P0 全部（body 色斑 / NavBar / 主题分裂 / Hero 全屏 / 去外壳） | 2h | 整体调性立起来 |
| **B3** | P1 全部（按钮/装饰色球/阴影精简） | 1h | 视觉清洁 |
| **B4** | P2 全部（文案 + eyebrow 风格统一） | 45min | 信息层级顺 |
| **B5** | P3 全部（删 reveal / Carousel 连续化 / Barrel 速度修正） | 1h | 交互跟手 |
| **B6** | P4 + P5（子页 + 性能） | 1h | 完成度 |

**推荐先做 B1 + B2 合批一次**，改完你验收这两批的效果，如果方向对再继续。

---

