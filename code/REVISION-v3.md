# REVISION-v3 — 100% 应用 `1.html` 与 `3.html`

> 本文件是「照抄」型迁移指南。用户已亲手调校 `code/1.html`（Hero）与 `code/3.html`（Three.js 图片画廊），要求 **100% 迁移** 到 Astro 项目里，不允许二次发挥。所有视觉 / 交互 / 参数都以两份 HTML 为准。

## 零、范围与不变式

- 项目根：`/Users/gonghui/我的/me/`
- 框架：Astro 6 + Tailwind v4 + MDX（已安装）
- 不新增 React 集成。`3.html` 的 React 组件改写为等价的 **vanilla Three.js**（Astro `<script>`），逻辑一比一保留。
- 主题：从「仅暗」升级为「暗 / 亮双模」，默认暗模式。切换按钮全站复用一个（见 §三）。
- 保留：内容集合（`posts`、`now`、`gallery`）、NavBar、Footer、路由、RSS。
- **不允许**改动 `1.html` / `3.html` 里定义的颜色、渐变比例、缓动常数、图层数量、光带形状、扫光周期（10s）、卡片数量（N=55）、光源强度等数值——除非文件自身给出条件（如暗/亮两套光带渐变）。

## 一、文件映射

| 来源 | 目的文件 | 定位 |
| --- | --- | --- |
| `code/1.html` 中的 `<style>` + 三层 `.scene-container` + 内容 UI | `src/components/HeroSpotlight.astro`（整体重写） | 首屏 Hero |
| `code/1.html` 的 `:root` / `body.light-mode` 变量 | `src/styles/global.css` | 全站主题变量 |
| `code/1.html` 的 `.theme-toggle` 按钮 + JS | `src/layouts/BaseLayout.astro`（新增 fixed 元素 + script） | 全站主题切换 |
| `code/3.html` 的 React + Three.js 组件 | `src/components/ImageBarrel.astro`（整体重写，vanilla TS script） | Gallery 沉浸式滚动 |
| 新增依赖：`three` | `package.json` | Three.js 支持 |

## 二、`1.html` → Hero 迁移细则

### 2.1 结构（HTML）

完整保留以下层级（同 `1.html` 189–293 行）：

```
<section class="hero">
  <div class="hero__surface" data-hero-root>
    <div class="noise-overlay"></div>
    <div class="ambient-glow"></div>
    <div class="scene-container dim-scene">  <!-- 4 条 ribbon -->
    <div class="scene-container mouse-scene" data-mouse-scene>  <!-- 4 条 ribbon -->
    <div class="scene-container wave-scene" data-wave-scene>  <!-- 4 条 ribbon -->
    <div class="hero__content">
      <div class="hero__tag">...</div>
      <h1>Hi，我是 <br/><span class="ui-gradient-text">林深</span> 👋</h1>
      <p class="hero__lead">{site 简介}</p>
      <div class="button-row">
        GitHub / 微信（带浮层）/ QQ（带浮层）/ 电话
      </div>
    </div>
  </div>
</section>
```

- 文案：Tag 固定 `Personal Portfolio`；标题保留 `Hi，我是` + `林深` + `👋`；简介用 `site.description`；按钮链接用 `site.github` + 占位 `微信 ID` / `QQ` / `tel:`（后续用户自改）。
- 4 条 ribbon × 3 个 scene-container = 共 12 个 `<div class="ribbon ribbon-N">`，一个不少。

### 2.2 CSS（100% 抄）

照抄 `1.html` 11–186 行的所有选择器：`:root` 变量、`body.light-mode` 变量、`body, html`、`.ui-text-main/.ui-text-muted/.ui-glass/.ui-glass-hover/.ui-gradient-text`、`.noise-overlay`、`.ambient-glow`、`.scene-container`、`.dim-scene`、`.mouse-scene`、`.wave-scene`、`.ribbon`、`.ribbon-1/2/3/4`（暗/亮两套渐变）、`@keyframes float`、`.theme-toggle`（**此块挪到 BaseLayout**）、`.icon-sun/.icon-moon`。

范围拆分：
- 全局 token（`:root` / `body.light-mode` 的背景+UI 变量、`.noise-overlay`、`.ambient-glow`、`.ui-*` 工具类）→ **`global.css`**（§三 说明）。
- Hero 专属（`.scene-container`、`.dim-scene/.mouse-scene/.wave-scene`、`.ribbon*`、`@keyframes float`）→ **`HeroSpotlight.astro` 的 `<style>`**（非 scoped 或使用 `:global`）。

> 注意：由于 Astro 默认组件样式 scoped，光带样式必须用 `<style is:global>` 或把 DOM 放在 scoped 作用域内但选择器用 `:global(.ribbon)`。选择前者更接近原文件结构。

### 2.3 JS（100% 抄）

`1.html` 296–387 行的 3 块逻辑全部搬运到 Hero 的 `<script>` 里，只改 DOM 查询范围：

1. **鼠标高光**：`window.addEventListener('mousemove'/'mouseout')` → 对 `document.getElementById('mouse-scene')`（改为 `[data-mouse-scene]`）设 `--mouse-x/--mouse-y/--bright-opacity`。阻尼系数 0.08 / 0.06。
2. **自动扫光**：`triggerSweep()` 每 10s 触发一次，`setTimeout(..., 1500)` 首次触发。淡入速率 0.05、滑动速率 0.6、上限 0.85，不变。
3. **主题切换按钮** → 迁往 BaseLayout（见 §三）。

### 2.4 尺寸

- `.hero` 占满视口高度：`height: 100dvh`，无 `min-height`。
- `.scene-container` 原文件写 `top: -10vh; right: -15vw; width: 80vw; height: 120vh;` — **完全保留**。
- 原 `1.html` 顶部没有 NavBar，但 Astro 会渲染 NavBar。NavBar 高度约 100px；不改动 NavBar 布局（floating），让它自然覆盖在 Hero 之上（有 `backdrop-filter`）。

## 三、主题系统（新增）

### 3.1 `global.css` 增量

在现有 `:root` 后追加 **来自 `1.html` 的背景/UI token**（重命名避免与现有冲突）：

```css
:root {
  /* 既有 token 保持不动 */
  --bright-opacity: 0;
  --wave-progress: -20%;
  --wave-opacity: 0;
  --mouse-x: 50vw;
  --mouse-y: 50vh;

  --noise-blend: overlay;
  --noise-opacity: 0.04;
  --ambient-glow: radial-gradient(circle at 70% 50%, rgba(30,15,50,0.1) 0%, rgba(0,0,0,0) 60%);
  --dim-opacity: 0.12;
  --dim-filter: grayscale(0.8) brightness(0.4) blur(1px);
  --ribbon-shadow: inset -20px 0 60px rgba(0,0,0,0.8), -40px 0 100px rgba(0,0,0,1);

  --ui-text-main: #ffffff;
  --ui-text-muted: rgba(255,255,255,0.6);
  --ui-border: rgba(255,255,255,0.15);
  --ui-glass-bg: rgba(255,255,255,0.05);
  --ui-glass-hover: rgba(255,255,255,0.12);
  --ui-gradient-from: #ffffff;
  --ui-gradient-to: rgba(255,255,255,0.3);
}

body.light-mode {
  --bg: #f6f7f9;
  --bg-elevated: #ffffff;
  --bg-deep: #eef1f5;
  --text-primary: #1a1a1a;
  --text-secondary: rgba(0,0,0,0.65);
  --text-tertiary: rgba(0,0,0,0.45);
  --border: rgba(0,0,0,0.12);

  --noise-blend: multiply;
  --noise-opacity: 0.02;
  --ambient-glow: radial-gradient(circle at 70% 50%, rgba(240,230,220,0.4) 0%, rgba(255,255,255,0) 60%);
  --dim-opacity: 0.03;
  --dim-filter: grayscale(0.2) brightness(1.05) contrast(0.9) blur(1px);
  --ribbon-shadow: inset -20px 0 60px rgba(0,0,0,0.015), -40px 0 100px rgba(0,0,0,0.03);

  --ui-text-main: #1a1a1a;
  --ui-text-muted: rgba(0,0,0,0.6);
  --ui-border: rgba(0,0,0,0.15);
  --ui-glass-bg: rgba(0,0,0,0.04);
  --ui-glass-hover: rgba(0,0,0,0.08);
  --ui-gradient-from: #1a1a1a;
  --ui-gradient-to: rgba(0,0,0,0.4);
}

.ui-text-main { color: var(--ui-text-main); transition: color 0.7s ease; }
.ui-text-muted { color: var(--ui-text-muted); transition: color 0.7s ease; }
.ui-glass {
  background: var(--ui-glass-bg);
  border: 1px solid var(--ui-border);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  transition: all 0.3s ease;
}
.ui-glass:hover { background: var(--ui-glass-hover); border-color: var(--ui-text-muted); }
.ui-gradient-text {
  background-clip: text;
  -webkit-background-clip: text;
  color: transparent;
  background-image: linear-gradient(to right, var(--ui-gradient-from), var(--ui-gradient-to));
  transition: background-image 0.7s ease;
}

body {
  transition: background-color 0.7s ease, color 0.7s ease;
}
```

### 3.2 `BaseLayout.astro` 增量

- 在 `<body>` 顶部增加固定按钮（沿用 `1.html` 196–209 行的 SVG 和 class）：

```astro
<button class="theme-toggle ui-glass" id="theme-btn" aria-label="Toggle Theme">
  <svg class="icon-moon" ...>...</svg>
  <svg class="icon-sun" ...>...</svg>
</button>
```

- 脚本逻辑：
  - 初始化读 `localStorage.theme`，若为 `light` 则 `document.body.classList.add('light-mode')`。
  - 点击 toggle：翻转 class，写 `localStorage.theme`。
  - 冷启动的 flicker 由 `<head>` 一段极短的 `<script is:inline>` 先行加 class 解决。
- `.theme-toggle` 样式来自 `1.html` 170–185 行，原样注入 `global.css`。

## 四、`3.html` → ImageBarrel 迁移细则

### 4.1 依赖

`pnpm add three`（或 `npm install three`）。`types`/`@types/three` 可不加，使用 `// @ts-nocheck` 或直接在 `.astro` 的 `<script>` 中用 `any` 型。为干净起见，建议安装 `@types/three`，但非强制。

### 4.2 结构（`ImageBarrel.astro` 全新）

```astro
---
import type { GalleryItem } from "../lib/gallery";
interface Props { items: GalleryItem[]; }
const { items } = Astro.props;
const TOTAL = 55;
const cardSrcs = Array.from({ length: TOTAL }, (_, i) =>
  items[i % items.length]?.src ?? ""
);
---

<section class="barrel3d" id="gallery">
  <div class="barrel3d__header">
    <h1 class="ui-text-main barrel3d__brand">林深<span>GALLERY</span></h1>
    <p class="ui-text-muted barrel3d__sub">VIRTUAL EXHIBITION SYSTEM</p>
    <div class="barrel3d__status">
      <span class="ui-text-muted">STATUS</span>
      <div><span class="dot"></span><span class="ui-text-main">ONLINE</span></div>
    </div>
  </div>

  <div class="barrel3d__stage" data-barrel3d data-srcs={JSON.stringify(cardSrcs)}></div>

  <p class="barrel3d__hint ui-text-muted">Drag to Rotate / Click to Focus</p>
</section>

<script>
  import * as THREE from "three";
  // ↓ 完全对应 3.html 38–313 行，改写要点见下方 §4.3
</script>

<style>/* §4.4 */</style>
```

### 4.3 JS 重写规则（100% 还原语义）

- `damp` 函数：一比一抄。
- 场景：`THREE.Scene` + `Fog('#030303', 18, 35)` + `PerspectiveCamera(32, aspect, 0.1, 100)` + `WebGLRenderer({ antialias, alpha:false })` + `setPixelRatio(min(devicePixelRatio, 2))`。
- 光源：`AmbientLight(0xffffff, 0.6)`、`DirectionalLight(0xffffff, 1.5) at (0,5,10)`、`PointLight(0x88bbff, 50, 50) at (-15,0,5)`、`PointLight(0xffaa88, 50, 50) at (15,0,5)`。
- 55 张卡片：原样保留循环内 `bulge`、`radius`、`baseTheta = i * 2.39996`、`aspectRatios`、`isLarge`、`targetArea`、`glassDepth`、`cornerRadius`、`extrudeSettings`、`MeshPhysicalMaterial(clearcoat=1, roughness=0, ...)` 等所有数值。
- 贴图：**替换** `https://picsum.photos/...` 为项目内 `data-srcs` JSON（本地静态资源），保持延迟加载 `setTimeout(i * 150)`。
- 交互：`onPointerDown/Move/Up/Click` 全部照抄；`stateRef` 改为闭包里的普通变量；React ref/state → 直接用 DOM 事件。
- 主题联动：订阅 `document.body.classList`（用 `MutationObserver`）或监听自定义 `theme-change` 事件，更新 `scene.fog.color` / `renderer.setClearColor` / `ambientLight.intensity` / `dirLight.intensity`（数值来自 3.html 316–332）。
- `mount.appendChild(renderer.domElement)` → 对应 `[data-barrel3d]` 容器；尺寸用容器实际宽高（不再是 `window.innerWidth/Height`），`onResize` 用 `ResizeObserver`。
- cleanup：`beforeunload` 卸载 + `cancelAnimationFrame`。

### 4.4 CSS

- `.barrel3d` 占满视口宽度，高度 `100dvh`；`position: relative`。
- 品牌 / 状态 / hint 的排布对应 `3.html` 348–382 行（top-left 品牌、top-right 状态、bottom-center 提示）。不再放 "DAY/NIGHT MODE" 按钮（主题按钮全站只有一个，位于 BaseLayout）。

### 4.5 `index.astro` 调整

- 继续 `<ImageBarrel items={galleryItems} />`，组件内部只消费 `src`。

## 五、执行顺序

1. `pnpm add three`（可选 `@types/three`）。
2. 追加 §3.1 的 `global.css` 变量与工具类。
3. 在 `BaseLayout.astro` 注入 `<button class="theme-toggle">` + `<script is:inline>`（防 flicker）+ 切换脚本。
4. 重写 `HeroSpotlight.astro`（§二）。
5. 重写 `ImageBarrel.astro`（§四）。
6. 本地 `pnpm dev`，逐屏人眼比对：
   - Hero 的光带数量、扫光周期、主题切换是否按 `1.html` 表现。
   - Gallery 的 55 张玻璃卡片、球形排布、拖动聚焦、主题响应是否按 `3.html` 表现。

## 六、验收

- [ ] 暗模式刷新首页，不出现白闪。
- [ ] Hero 鼠标移动时 4 条彩色光带由暗→亮揭示；鼠标离开恢复。
- [ ] 页面加载 1.5s 后触发一次全屏扫光，此后每 10s 再来一次。
- [ ] 点右上角圆形按钮 → 切到亮色（光带变高饱和、背景变 `#f6f7f9`），再点回来。
- [ ] Gallery 区默认自转，拖拽可变速；点击一张卡片它飞到屏幕中心并变亮，其它卡片淡出；再点空白处恢复。
- [ ] 切主题时 Three.js 雾色/背景色随之变化。
- [ ] `pnpm check` 通过；`pnpm build` 通过。
