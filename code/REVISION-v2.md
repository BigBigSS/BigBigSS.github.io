# REVISION-v2.md — Hero 重做 + 全站布局重审

> REVISION.md（v0.3）的 Hero 方案（§二 "7 条倾斜椭圆"）**在本文档中被作废**。
> REVISION.md 的 Barrel 方案（§2.2）和 P0-P5 全站评审（§六）**继续有效**，不要推翻。

---

## 零、关于 C1/C2 图片

在 `/Users/gonghui/我的/me/code/` 下没有看到 C1 或 C2 文件，上传可能没落地。
但你提供的**那段文字描述 + 参考 1.png** 已经足够精确，我按这两个资料重写方案。如果你后续把 C1/C2 补上来，我再做第二轮微调。

---

## 一、自我批评：上一版 Hero 方案为什么错

对照你的描述，我之前的"7 条倾斜椭圆 + blur + screen blend"有**三个硬伤**：

| 硬伤 | 你的描述要的是 | 我给的是 |
|---|---|---|
| **形状** | 扭曲、弯曲的 S 形波浪彩带（像被缓缓扭动的百叶窗/流体柱） | 凸圆形椭圆 → 永远做不出"扭曲波浪"感 |
| **材质** | 磨砂噪点、哑光、像磨砂金属或高级纸张 | `filter: blur` 产生的霓虹光晕 → 错成了廉价霓虹灯 |
| **Mask 边缘** | 烟雾/极光般柔软消散 | 硬圆形打孔，边缘仍然明显 |

这三个哪一个都不能靠参数微调救回来。**必须换技术方案。**

---

## 二、新方案：SVG 波浪路径 + feTurbulence 噪点 + 多段烟雾遮罩

### 2.1 四层架构（纸上先画清楚）

```
<section.hero>                                 黑底
  ├─ <svg class="hero__ribbons">               Layer 1：7 条弯曲 SVG 路径（彩带本体）
  ├─ <div class="hero__warp"></div>            Layer 2（可选）：feTurbulence displacement 扭曲
  ├─ <div class="hero__grain"></div>           Layer 3：磨砂噪点（feTurbulence 生成）
  ├─ <div class="hero__mask"></div>            Layer 4：多段烟雾遮罩，跟鼠标
  └─ <div class="hero__content">...</div>      Layer 5：文字 + CTA
</section>
```

**关键**：彩带和噪点在 mask **之下**，mask 是一层黑玻璃；鼠标在哪，哪里的黑玻璃"变透明"，彩带+噪点才露出。这是"犹抱琵琶半遮面"的物理实现。

---

### 2.2 SVG 彩带（核心·必做）

7 条 `<path>`，每条是一条弯曲的**闭合 S 形**，填单色。颜色从左到右按你描述的顺序：**绿 → 黄 → 橙 → 红 → 粉 → 紫 → 蓝 → 青**（7 色，我把橙和红合并，得到 7 段）。

**替换 HeroSpotlight.astro 的 `.hero__spectrum` 和 `.hero__bands` 两个 div，插入：**

```astro
<svg
  class="hero__ribbons"
  viewBox="0 0 1600 900"
  preserveAspectRatio="xMidYMid slice"
  aria-hidden="true"
>
  <defs>
    <!-- 柔化彩带边缘 -->
    <filter id="ribbon-soften" x="-10%" y="-10%" width="120%" height="120%">
      <feGaussianBlur stdDeviation="18"/>
    </filter>
    <!-- 扭曲变形：给彩带"揉"一下，让它们看起来像流体 -->
    <filter id="ribbon-warp" x="-15%" y="-15%" width="130%" height="130%">
      <feTurbulence type="fractalNoise" baseFrequency="0.006" numOctaves="2" seed="7" result="noise"/>
      <feDisplacementMap in="SourceGraphic" in2="noise" scale="80" xChannelSelector="R" yChannelSelector="G"/>
      <feGaussianBlur stdDeviation="14"/>
    </filter>
  </defs>

  <g filter="url(#ribbon-warp)" opacity="0.95">
    <path d="M 320,-80 C 420,220 280,520 380,980 L 490,980 C 420,520 550,220 470,-80 Z" fill="#84cc16"/>
    <path d="M 470,-80 C 570,180 430,560 540,980 L 650,980 C 570,560 700,180 620,-80 Z" fill="#facc15"/>
    <path d="M 620,-80 C 730,240 600,520 700,980 L 820,980 C 740,520 830,240 770,-80 Z" fill="#f97316"/>
    <path d="M 790,-80 C 900,200 760,560 850,980 L 970,980 C 900,560 990,200 920,-80 Z" fill="#ef4444"/>
    <path d="M 960,-80 C 1060,220 920,500 1020,980 L 1140,980 C 1060,500 1170,220 1090,-80 Z" fill="#a855f7"/>
    <path d="M 1130,-80 C 1240,180 1080,540 1180,980 L 1300,980 C 1240,540 1330,180 1260,-80 Z" fill="#3b82f6"/>
    <path d="M 1300,-80 C 1420,200 1260,520 1360,980 L 1480,980 C 1420,520 1500,200 1420,-80 Z" fill="#22d3ee"/>
  </g>
</svg>
```

**CSS（新增）：**

```css
.hero__ribbons {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  /* 用 screen 混合让彩带发光感更强，但因为上面还要盖噪点和 mask，这里先保持正常 */
}
```

**为什么能"扭"**：
- 每条 path 是手写的 S 形曲线（顶 → 中部弯折 → 底）
- 外层再用 `feTurbulence + feDisplacementMap` 把整组 path 按柏林噪声变形一下 → "像被水波纹揉过"
- **`scale="80"` 是扭曲强度**：0 完全不扭，120 很夸张，80 是中等"流体感"。先用 80，不喜欢调到 40 或 120。
- **`seed="7"`** 是噪声种子，改这个数字可以换不同的"扭法"

**如果你觉得不需要扭得这么厉害**：把 `<g filter="url(#ribbon-warp)">` 改成 `<g filter="url(#ribbon-soften)">`，只做柔化不做扭曲。

---

### 2.3 磨砂噪点（这是你点名必须有的"高级感"）

这是整个效果的灵魂。彩带再漂亮，没有噪点就是廉价霓虹。

**新增在 SVG 之后：**

```astro
<div class="hero__grain" aria-hidden="true"></div>
```

**CSS：**

```css
.hero__grain {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 1;
  /* 内联 SVG turbulence，生成细密黑白噪点 */
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 320 320'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)' opacity='0.85'/></svg>");
  background-size: 200px 200px;
  opacity: 0.22;
  mix-blend-mode: overlay;
}
```

**关键参数**：
- `baseFrequency='0.9'`：噪点密度，越大越细；0.8-1.0 是"高级磨砂"的甜点区
- `opacity: 0.22`：噪点强度；超过 0.35 会"脏"，低于 0.12 看不见
- `mix-blend-mode: overlay`：让噪点既影响暗部也影响亮部，形成真正的"质感"而不是覆盖色

**这一层铺满整个 Hero**，不只是彩带区 —— 全屏的磨砂感才是"高级哑光纸"的体感。

---

### 2.4 烟雾状多段遮罩（替代硬圆打孔）

替换 `.hero__mask` 的 CSS 为：

```css
.hero__mask {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 2;
  background:
    /* 8 段渐变，过渡柔和到消散无痕 */
    radial-gradient(
      circle 600px at var(--mx) var(--my),
      rgba(0, 0, 0, 0.00) 0%,
      rgba(0, 0, 0, 0.03) 14%,
      rgba(0, 0, 0, 0.12) 30%,
      rgba(0, 0, 0, 0.30) 46%,
      rgba(0, 0, 0, 0.55) 62%,
      rgba(0, 0, 0, 0.76) 76%,
      rgba(0, 0, 0, 0.90) 88%,
      rgba(0, 0, 0, 0.97) 100%
    );
}
```

**关键**：
- **8 段 stop**（不是 2-3 段）。每两段透明度差 ≤ 0.25，过渡才够软
- 不要在 mask 上加 blur（会模糊文字），只靠渐变曲线本身实现"烟雾"
- 600px 的半径刚好能包住 "林深" 这种级别的 hero title；如果你的屏幕很大可改 800px

---

### 2.5 Hero 容器去掉"卡片感"

替换 `.hero__surface` 为：

```css
.hero__surface {
  --mx: 72%;
  --my: 40%;
  position: relative;
  width: 100%;
  height: 100vh;            /* 真·全屏 */
  overflow: hidden;
  background: #050507;      /* 纯黑，不要 gradient 也不要 border-radius */
  isolation: isolate;
}

.hero {
  padding-top: 0;           /* 原来是 8px，去掉 */
}
```

删除原来的 `border-radius: 40px`、`box-shadow: var(--shadow-hard)`、`min-height: min(860px, ...)`。

**main 也要调整**（`global.css:110`）：
```css
main { padding-top: 0; }    /* 让 Hero 贴到页面顶 */
```
NavBar 直接漂浮在 Hero 上面（它本来就是 `position: fixed`）。

---

### 2.6 文字区居中（原来左对齐看起来失衡）

替换 `.hero__inner` + `.hero__content` 为：

```css
.hero__inner {
  position: relative;
  display: grid;
  place-items: center;    /* 水平 + 垂直居中 */
  min-height: inherit;
  z-index: 3;
}

.hero__content {
  max-width: 760px;
  padding: 0 24px;
  text-align: center;     /* 内部全居中 */
  color: #f8fafc;
}

.button-row {
  justify-content: center;
}

.hero__footer {
  justify-content: center;
}
```

参考 1.png 里 "First a spec, then the code." 就是大字居中。你的 "林深" 居中会显得更"占地方"、更像 landing。

---

## 三、全站布局重审（你点名 + 我补充）

### 3.1 About / Now 占比太小 ✅ 你的感觉完全正确

**现状诊断**：
- Hero = 100vw（全屏）
- About = `.copy-shell` = **720px**（在 1920 屏上只占 37%）
- Now = 720px（同上）
- Coverflow = `.page-shell` = 1280px
- Barrel = 1280px

**视觉节奏**：`100% → 37% → 37% → 66% → 66%` —— 中间两段突然瘪下来，像一张海报里被人抠掉了两块。

**修复：3 选 1，推荐 B**

---

#### 方案 A：About / Now 加宽到 page-shell（1280px），做两栏

```astro
<section class="section about">
  <div class="page-shell about-grid">
    <div class="about-grid__text">
      <SectionHeading index="02" label="about" title="..." />
      <p>...自我介绍...</p>
    </div>
    <aside class="about-grid__aside">
      <!-- 右栏放：一张头像 + 最近三件事 + 技能标签 -->
    </aside>
  </div>
</section>
```

成本：低；效果：能填满但略"传统"。

---

#### 方案 B（推荐）：**Bento 网格**

About 拆成 4-6 个不等大的卡片：

```
┌───────────────────────────┬──────────────┐
│                           │              │
│  自我介绍（大卡，占 2 列） │  头像 / mark │
│                           │   （小卡）    │
├─────────────┬─────────────┴──────────────┤
│             │                            │
│  在做什么    │  用什么工具                 │
│  （3 条）    │  （logo 云）                │
│             │                            │
├─────────────┴─────────────┬──────────────┤
│                           │              │
│  联系方式（3 个渠道）       │  一句话座右铭 │
│                           │              │
└───────────────────────────┴──────────────┘
```

CSS：`display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 20px;`，每个卡 `surface-card`。

Now 段同样处理：不是 3 个竖着堆的 card，而是：
- 一张最新动态大卡（横跨 2 列）
- 两张小卡（短条动态）
- 一张"活动热力图"小卡（类似 GitHub contribution），装饰性

成本：中；效果：立刻从"博客"升级为"信息密集型个人站"。

---

#### 方案 C：保 720px 不变，加背景视觉

在 About 区的左右各加一条**垂直彩带**从 section 顶贯穿到底，和 Hero 彩虹呼应。本质是用"背景满"救"前景窄"。

成本：低；效果：挽救但治标。

---

### 3.2 其他我新发现 / 之前没说透的布局问题

#### L1 · Hero 文字左对齐 + 右侧彩带 → 视觉重心偏左
文字在左 620px 宽，右边 40% 是彩带。左侧文字重，右侧颜色重，两边都"重"，中间空。
**修复**：见 §2.6，改居中。

#### L2 · Hero → About 的过渡硬切
Hero 结束是纯黑 + 彩带，下一屏突然变成米白 + 720px 窄栏。审美断裂。
**修复**：Hero 底部加一个 120px 高的渐变过渡区：
```css
.hero__surface::after {
  content: "";
  position: absolute;
  bottom: 0; left: 0; right: 0;
  height: 120px;
  background: linear-gradient(180deg, transparent, var(--bg));
  pointer-events: none;
  z-index: 4;
}
```
让黑到米白渐变融合。

#### L3 · 5 个 section 高度几乎相等（160px padding 叠等宽内容）
滚动起来像在翻一本"每页大小一致"的书，没有节奏。
**修复**：刻意制造"松-紧-松-紧"：
- Hero = 100vh（紧）
- About bento = auto（松，内容撑开）
- Now = 紧凑（只有 3 条动态，360px）
- Coverflow = 720px（紧，视觉重）
- Barrel = 900px（松，视觉最重）

#### L4 · 页面缺一根"脊椎"
每个 section 都是独立岛屿。参考站点的 section 之间有看不见但能感知的"节拍器"（很多站点用一条竖向细线或 01/02/03 编号做贯穿）。
**修复（可选）**：在页面左侧或正中加一条 `position: fixed` 的 1px 竖线（透明度 0.1），从顶到底。每个 section 的编号（01/02/...）**定位到这根线上**，让它成为节拍器。

#### L5 · Barrel 上方 SectionHeading 和桶的距离只有 48px
桶的顶行图片几乎贴着 heading 的 lead 文字。
**修复**：`.barrel__surface { margin-top: 96px; }`（原 48px）。

#### L6 · Coverflow 下方 hint 距离卡片 18px，太挤
"DRAG TO STEER · HOVER TO PAUSE" 几乎贴着卡片底边。
**修复**：`.carousel__hint { margin: 48px 0 0; }`（原 18px）。

#### L7 · Footer 紧跟最后一个 section（Barrel）
Barrel 最后一行图片结束 → 立即 Footer。落尾仓促。
**修复**：在 Barrel 和 Footer 之间插入一个"签名区"（高度 200px）：
```
╔════════════════════════════╗
║                            ║
║    — 林深 · 2026 · 杭州 —    ║
║                            ║
║     源码在 GitHub →          ║
╚════════════════════════════╝
```
全居中、大字、间距大，作为"告别"。

#### L8 · 导航选项 4 个但 Hero 里又放了 3 个 pill 标签
NavBar：About / Now / Writing / Gallery（4 项）
Hero 底部 pill：backend systems / AI workflows / quiet notes（3 项）
两组都在 Hero 视野内，信息密度翻倍，用户不知道看哪个。
**修复**：删掉 Hero 的 3 个 pill（见 REVISION.md §六 P1-6）。

---

## 四、修改批次（合并 REVISION.md + REVISION-v2.md）

| 批次 | 内容 | 来源 | 工作量 |
|---|---|---|---|
| **B1（最高优先级）** | Hero 完整重做：SVG 彩带 + 噪点 + 烟雾遮罩 + 全屏 + 居中 | 本文 §2 | 3h |
| **B2** | Barrel 稠密化（10×6 → 20×10，加球面鼓起） | REVISION.md §2.2 | 1h |
| **B3** | About/Now Bento 重排（方案 B） | 本文 §3.1 | 2h |
| **B4** | P0 结构性修正（去胶囊 NavBar / 去卡片外壳 / 处理主题分裂） | REVISION.md §六 P0 | 1.5h |
| **B5** | P1 视觉细节 + L1-L8 布局细节 | REVISION.md §六 P1 + 本文 §3.2 | 1.5h |
| **B6** | 文案 / 交互 / 子页 | REVISION.md §六 P2-P5 | 2.5h |

**总计约 11.5h。**

---

## 五、建议先做 B1 一批

Hero 是你最不满意的地方，也是权重最大的一块。

**我直接动手做 B1 的话，会：**
1. 把 `src/components/HeroSpotlight.astro` 基本重写（结构 + CSS）
2. 修改 `src/styles/global.css` 的 `main { padding-top: 0 }`
3. 保留你现有的 `data-spotlight-root` 鼠标跟随 JS，只改 `.hero__mask` 渐变
4. 不碰其他文件

改完你刷新看效果。不到位我再迭代参数（彩带扭曲强度、噪点密度、mask 圆半径）。

**要我现在就动 B1 吗？** 还是你想先看这份 REVISION-v2.md 提意见再说。
