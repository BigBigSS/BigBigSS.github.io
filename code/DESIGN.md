# DESIGN.md — 个人网站设计规范

> 本文档先于代码存在。任何视觉/结构问题，先来这里改，再去改代码。
> 灵感参考：[KAOPU-XiaoPu/web-design](https://github.com/KAOPU-XiaoPu/web-design) — "spec first, code second"。

---

## 0. 文档说明

| 项 | 状态 |
|---|---|
| 版本 | **v0.2 — Route B (Visual)** |
| 设计方向 | **视觉化、立体、有动效**。原 v0.1 的"极简骨架"路线已废弃 |
| 占位内容 | 名字、自我介绍、动态、图片都是**虚构占位**，上线前替换 |
| 默认主题 | **浅色**（深色为可选切换） |
| 部署目标 | 本地开发 → 自有服务器（nginx 静态托管） |

### v0.2 关键变化（vs v0.1）
- 加入三大视觉组件：**Hero 鼠标聚光彩虹背景**、**3D 文章卡 Coverflow**、**3D 图片桶**
- 强调色从单一蓝色 → **7 色彩虹光谱**
- 性能预算从 `JS < 30KB` → `JS < 80KB`（动效成本）
- 新增 `/content/gallery` 内容目录（图片墙的素材源）

---

## 1. 品牌身份（占位，可改）

| 字段 | 值 |
|---|---|
| 中文名 | 林深 |
| 英文名 / Handle | linshen |
| 一句话身份 | 软件工程师 · 在做后端与 AI 工程化 |
| 站点 Slogan | *Quiet code. Loud ideas.* |
| 个性关键词 | 立体感 · 视觉冲击 · 内容温度 |

**调性**：参考 Linear / Vercel / Apple 那种"黑底彩光、有立体感、但又冷静"的现代科技风。

---

## 2. 设计原则（v0.2 新版）

1. **黑色是画布，光是颜料** — 深色主题是视觉基底，亮色和动效是表达手段
2. **每个动效都要有"理由"** — 鼠标聚光给 Hero 灵气、3D Coverflow 让文章变成实物、图片桶把记忆变成行星
3. **浅色主题不是次品** — 浅色下用低饱和的彩虹+柔光替代深色下的霓虹，要等好看
4. **动效不卡** — 60fps 是底线；用 `transform` / `opacity`，不用 `top/left/width`
5. **内容仍是主角** — 视觉效果服务内容（图片来自博客、卡片来自文章），不是为炫而炫

---

## 3. 颜色 Token

### 3.1 浅色主题（默认）

| Token | HEX | 用途 |
|---|---|---|
| `bg` | `#fafaf9` | 页面底色（米白） |
| `bg-elevated` | `#ffffff` | 卡片、悬浮层 |
| `bg-deep` | `#0a0b0e` | **Hero 聚光区强制深色**（即使浅色主题） |
| `text-primary` | `#18181b` | 正文 |
| `text-secondary` | `#52525b` | 次要文字 |
| `text-tertiary` | `#a1a1aa` | 元信息 |
| `border` | `#e4e4e7` | 分割线 |
| `accent` | `#6366f1` | 链接、强调 |

> **注**：浅色主题下，Hero 区域**反向使用深色背景**（`bg-deep`），因为彩虹聚光效果在深色上才出彩。这是参考站点的同款做法。

### 3.2 深色主题

| Token | HEX | 用途 |
|---|---|---|
| `bg` | `#0a0b0e` | 页面底色 |
| `bg-elevated` | `#14151a` | 卡片 |
| `text-primary` | `#f4f4f5` | 正文 |
| `text-secondary` | `#a1a1aa` | 次要文字 |
| `text-tertiary` | `#52525b` | 元信息 |
| `border` | `#27272a` | 分割线 |
| `accent` | `#818cf8` | 链接、强调 |

### 3.3 彩虹光谱（核心视觉资产）

7 个均匀分布的色站，用于：Hero 聚光背景的 conic-gradient、3D 桶的环境光、文章卡的渐变描边。

| Token | HEX | 角度（conic 用） |
|---|---|---|
| `spectrum-1` 红橙 | `#ff6b3d` | 0° |
| `spectrum-2` 琥珀 | `#f59e0b` | 51° |
| `spectrum-3` 青柠 | `#84cc16` | 103° |
| `spectrum-4` 青蓝 | `#06b6d4` | 154° |
| `spectrum-5` 靛 | `#6366f1` | 206° |
| `spectrum-6` 紫 | `#a855f7` | 257° |
| `spectrum-7` 玫红 | `#ec4899` | 309° |

**为什么是这 7 色**：覆盖暖→冷→紫→粉的完整循环，conic 连接不会断；饱和度统一在 65-75%，深色下不刺眼；每两色之间在色相环上等距，渐变平滑。

---

## 4. 字体

| 用途 | 字体栈 |
|---|---|
| Sans（正文/标题） | `Inter, "PingFang SC", "Source Han Sans SC", system-ui, sans-serif` |
| Mono（代码 / 编号） | `"JetBrains Mono", ui-monospace, "SF Mono", monospace` |
| Display（Hero 大字） | `"Inter Display", Inter, sans-serif`（Inter 的展示字号变体） |

### 4.1 字号阶梯

| 命名 | 桌面 | 移动 | 行高 | 字距 | 用途 |
|---|---|---|---|---|---|
| `hero` | **88px** | 56px | 1.05 | -0.04em | Hero 名字（v0.2 加大） |
| `display` | 56px | 40px | 1.1 | -0.025em | 大标题 |
| `h1` | 40px | 32px | 1.2 | -0.02em | 文章标题 |
| `h2` | 28px | 24px | 1.3 | -0.015em | 章节标题 |
| `h3` | 20px | 18px | 1.4 | -0.01em | 小节标题 |
| `body` | 16px | 16px | 1.7 | 0 | 正文 |
| `small` | 14px | 14px | 1.6 | 0 | 元信息 |
| `tiny` | 12px | 12px | 1.5 | 0.02em | 标签、日期 |

**字重**：Regular 400 / Medium 500 / Semibold 600 / **Bold 700**（v0.2 解禁，Hero 用）。

---

## 5. 间距（8px 网格）

基础单位 `4px`，常用阶梯：`4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96 · 128 · 160 · 200`

| 场景 | 间距 |
|---|---|
| 段落之间 | 24px |
| 章节之间 | 160px 桌面 / 96px 移动（v0.2 加大，给立体感呼吸） |
| 卡片内边距 | 24px |
| Section 上下 padding | 160px / 96px |
| 内容容器最大宽度 | 720px（阅读区）/ 1280px（视觉效果区，全宽） |

---

## 6. 布局

- **正文区**：720px 居中，留白
- **视觉区**（Hero / Coverflow / 桶）：**全宽 100vw**，给立体感空间
- 顶部 NavBar：固定 64px，背景半透明 + backdrop-blur(16px)
- 移动端：左右 padding 24px
- 视觉区在移动端**降级**为静态展示（保留好看，关闭 3D 旋转，避免性能/操作问题）

---

## 7. 组件清单

### 7.1 NavBar
```
┌─────────────────────────────────────────────────┐
│  ◐  林深        About  Now  Writing  Gallery  ☼│
└─────────────────────────────────────────────────┘
```
- 左：Logo 圆点（`spectrum-5` 颜色）+ 站名
- 中右：导航
- 最右：主题切换 icon
- 滚动 > 100px 时背景从透明 → `bg/80` + blur(16px)

### 7.2 ⭐ HeroSpotlight（鼠标聚光彩虹背景）

**视觉**：
```
[全黑背景]
      ╲
       ╲   ●  ← 鼠标位置周围 600px 半径内
        ╲    彩虹斜条纹"亮起"
         ╲   其余区域接近全黑
                
              林深
              软件工程师 · 在做后端与 AI 工程化
              [Get in touch]   [Read the blog]
```

**实现要点**：
1. **底层**：一个 `<canvas>` 或 `<div>`，背景是 7 色光谱组成的 `conic-gradient` 或多个旋转的径向渐变（参考站点用斜的多色光带）
2. **遮罩层**：`<div>` 全覆盖，背景是径向渐变 `radial-gradient(circle 600px at var(--mx) var(--my), transparent, rgba(0,0,0,0.92))`
3. **JS**：监听 `mousemove`，用 `requestAnimationFrame` 节流，更新 CSS 变量 `--mx --my`
4. **触摸设备**：自动让聚光固定在中心 + 缓慢漂移（避免移动端无鼠标）
5. **性能**：CSS-only 优先，<2KB JS

**Hero 内容**：
- 编号：`01 / hello`（mono，spectrum-2 色）
- 名字：`hero` 字号，**白色 + 微 bloom 发光**
- 副标题：`display` 字号，`text-secondary`
- 简介：2 行 `body`
- 两个 CTA 按钮：主按钮（`spectrum-5` 渐变填充）+ 次按钮（边框）

### 7.3 ⭐ PostCarousel3D（3D 文章卡 Coverflow）

**视觉**（参考站点图 2）：
```
       ╱─────╮      ╱─────╮      ╱─────╮
      │      │  →  │      │  ←  │      │
      │ Card │     │ Card │     │ Card │
       ╲─────╯      ╲─────╯      ╲─────╯
       倾斜 -25°    正面          倾斜 +25°
```

**实现要点**：
1. 容器：`perspective: 1200px`，`transform-style: preserve-3d`
2. 卡片：`transform: translateX(...) rotateY(...)`，每张卡按位置算偏移和角度
3. 自动滚动：60s 一圈，无限循环
4. 交互：hover 整个区域 → 暂停；鼠标拖拽 → 手动控制方向和速度
5. 卡片内容：编号 / 标题 / 描述 / 标签 / 日期 / **微微的彩虹边光**（用 `spectrum-N` 做 box-shadow）

**移动端降级**：变成横向滚动（`overflow-x: auto`），不做 3D。

### 7.4 ⭐ ImageBarrel（3D 图片桶 / 旋转的图片墙）

**视觉**（参考站点图 3）：
- 几十张方形图片排列在一个**横躺的圆柱表面**（参考站点是略带球面的桶）
- 整体围绕 Y 轴**自动旋转**，约 40s 一周
- 鼠标拖拽 → 改变方向和速度
- hover 单张图 → 该图缩放 110% + 边光增强

**实现选型**：
- **v1：纯 CSS 3D**（无依赖）
  - 经纬度公式分布 60 张图（10 列 × 6 行）在圆柱表面
  - 每张图 `transform: rotateY(angle) translateZ(radius)`
  - 容器整体 `transform: rotateY(spin)`，CSS animation 驱动
- **v2 备选**：如需 100+ 图或更平滑曲面，迁移 Three.js（+130KB JS）

**桶参数**：
| 项 | 值 |
|---|---|
| 半径 | 480px |
| 高度 | 600px |
| 列数 × 行数 | 10 × 6 = 60 张 |
| 单张尺寸 | 120 × 160 px |
| 旋转周期 | 40s |

**图片来源**：
- 用户的博客文章中插入的图片（自动收集，写入 `/content/gallery/index.json`）
- **图不够 60 张时**：循环复用 + 用 `picsum.photos/120/160?random=N` 做占位
- 占位图自动随主题切换（浅色用浅色随机图，深色用暗色调）

**移动端降级**：网格瀑布流（3 列），无 3D。

### 7.5 NavBar / Section / PostCard / NowEntry / ThemeToggle / Link / Prose
（与 v0.1 一致，省略详细描述。详情见原文档 §7.1, §7.3-§7.8）

---

## 8. 页面结构

### 8.1 路由表

| 路径 | 用途 |
|---|---|
| `/` | 单页主页，含全部三大视觉组件 |
| `/now` | 完整动态时间线 |
| `/posts` | 全部博客文章列表（普通网格） |
| `/posts/[slug]` | 单篇文章 |
| `/gallery` | 完整图片墙（普通瀑布流，桶的"完整版"） |
| `/rss.xml` | RSS |
| `/404` | 极简 404 |

### 8.2 主页内容流（v0.2 新流）

```
[NavBar]

╔═══════════════════════════════════════╗
║  01 / hello                           ║
║                                       ║
║         林深                          ║   ← HeroSpotlight
║   软件工程师 · 在做后端与 AI 工程化     ║   （全宽，鼠标聚光彩虹）
║                                       ║
║   [Get in touch]   [Read the blog]    ║
╚═══════════════════════════════════════╝

  02 / about
    ───────────────
    200~400 字自我介绍                       ← 普通区，720px 居中

  03 / now
    ───────────────
    最新 3 条动态 + "查看全部 →"             ← 普通区

╔═══════════════════════════════════════╗
║  04 / writing                         ║
║   ╱──╮ ╱──╮ ╱──╮ ╱──╮ ╱──╮             ║   ← PostCarousel3D
║  │   ││   ││   ││   ││   │             ║   （全宽，3D 卡片轮转）
║   ╲──╯ ╲──╯ ╲──╯ ╲──╯ ╲──╯             ║
╚═══════════════════════════════════════╝

╔═══════════════════════════════════════╗
║  05 / gallery                         ║
║                                       ║
║          ▓▓▓▓▓▓▓▓▓                   ║   ← ImageBarrel
║         ▓▓▓▓▓▓▓▓▓▓▓                  ║   （全宽，3D 图片桶）
║          ▓▓▓▓▓▓▓▓▓                   ║
╚═══════════════════════════════════════╝

[Footer]
  © 2026 林深 · GitHub · Email · RSS
```

**留意**：三个视觉组件之间用普通板块（about、now）隔开，避免连续视觉轰炸。这是节奏设计。

---

## 9. 主题切换行为

- **首次访问**：跟随系统（prefers-color-scheme）
- **用户切换后**：写入 `localStorage.theme`
- **防闪烁**：在 `<head>` 内联 inline script，先于 CSS 加 `dark` class
- **过渡**：`body` 的 `bg/color` 加 200ms transition；视觉组件的彩虹颜色独立切换（深色霓虹 vs 浅色柔光）

---

## 10. 动画 / 微交互

| 场景 | 行为 |
|---|---|
| 链接 hover | `opacity` / `color` 150ms ease-out |
| 卡片 hover | `transform: translateY(-4px)` + 边光增强 200ms |
| Hero 聚光 | 跟随鼠标，无延迟（rAF 节流 60fps） |
| Coverflow 自动转 | 60s 一圈 linear 无限循环 |
| Coverflow 拖拽 | 跟手，松手后惯性减速（200ms ease-out） |
| 图片桶自动转 | 40s 一周 linear |
| 图片桶 hover 单图 | 缩放 1.1，边光出现，z-index 提升 |
| 主题切换 | `bg/color` 200ms |
| 滚动出现动画 | **轻量 fade-in-up**（IntersectionObserver，每个 section 触发一次） |

---

## 11. 内容架构

```
/content
  /posts          ← Markdown 博客文章
    2026-04-10-distributed-eventual-consistency.mdx
  /now            ← 短动态
    2026-04-18.mdx
  /gallery
    index.json    ← 图片元数据（URL / alt / 来源文章 / 主题色）
    /uploads      ← 你上传的原图（构建时优化）

/public
  /images         ← 静态图片资源
```

**Gallery 元数据格式**：
```json
[
  { "src": "/images/foo.jpg", "alt": "K8s 架构图", "post": "k8s-tls", "tone": "dark" },
  { "src": "https://picsum.photos/seed/1/240/320", "alt": "占位", "post": null, "tone": "any" }
]
```

构建脚本：扫描 `/content/posts/**/*.mdx`，提取所有 `![alt](src)` 图，自动写入 `index.json`。不足 60 张则填充 picsum 占位。

---

## 12. 图标

- 库：[Lucide](https://lucide.dev)
- 尺寸：16 / 20 / 24
- 描边：`1.5px`
- 颜色：跟随当前文字色

---

## 13. 可访问性（A11y）

- WCAG AA 对比度
- focus-visible ring
- 语义化 HTML
- **`prefers-reduced-motion: reduce` 时**：
  - Hero 聚光改为静态居中
  - Coverflow 停止自转
  - 图片桶停止旋转
- 视觉组件不承担信息传达职责（信息也通过文字给出）

---

## 14. 性能预算（v0.2 调整）

| 指标 | 目标 |
|---|---|
| 首页 JS 体积 | < **80 KB**（gzip）— 含三大视觉组件 |
| 首屏 LCP | < 1.5s（本地）/ < 2.5s（公网） |
| 首屏 CLS | < 0.05 |
| Lighthouse 性能 | ≥ 90（视觉组件会让得分略低） |
| 图片 | 全部 lazy + 响应式 + WebP |
| 图片桶 60 张图 | **总大小 < 800KB**（每张缩略图 < 15KB） |

---

## 15. v1 范围

**做：**
- ✅ 三大视觉组件（Hero 聚光 / Coverflow / 图片桶）
- ✅ 浅深双主题
- ✅ Markdown 博客 + 动态
- ✅ RSS
- ✅ 图片自动收集脚本

**不做：**
- ❌ 评论 / 搜索 / 分析 / Tag 聚合页 / 多语言

---

## 16. 占位文案 / 资源

### About 段落
> 你好，我是林深，目前在做后端工程和一些 AI 工程化的事情。喜欢把复杂的系统讲清楚，也喜欢在工作之外写写代码、读读书、走走路。
> 这个站点是我留给自己的一块自留地：放一些长一点的文字（writing），一些短一点的状态（now），还有一墙我喜欢的图片（gallery）。

### Now 占位（3 条）
- `2026-04-18` 今天调通了 K8s ingress 的 TLS，比想象中简单。
- `2026-04-15` 把博客从 Hugo 换成了 Astro。少了一半模板文件。
- `2026-04-12` 跑步 5 公里，久违的 24 分钟以内。

### Posts 占位（2 篇）
1. **分布式系统里的"最终一致性"其实没那么玄乎** — 关于 CAP、Paxos 和一杯凉了的咖啡。
2. **为什么我又把博客重写了一遍** — 极简框架带来的爽与不爽。

### Gallery 占位（v1 用 picsum）
- 60 张：`https://picsum.photos/seed/{1..60}/240/320`
- 后续替换为真实文章配图

---

## 17. 实施顺序（给开发用）

1. **脚手架**：`npm create astro@latest` + Tailwind + MDX
2. **基础**：颜色 token、字体、NavBar、ThemeToggle、布局
3. **静态页**：About、Now、Posts、单文章页
4. **视觉组件 ① HeroSpotlight**：先纯 CSS 实现，再加 JS 鼠标跟随
5. **视觉组件 ② PostCarousel3D**：3D transform 静态版 → 自动滚动 → 拖拽
6. **视觉组件 ③ ImageBarrel**：经纬度排布 → 自动旋转 → 拖拽 → 元数据脚本
7. **抛光**：动画曲线、reduced-motion、移动端降级、SEO/RSS
8. **构建 & 部署**：`astro build`，nginx 配置示例

---

## 18. 待你确认的点（开工前最后一轮）

1. **品牌身份**（§1）："林深 / 软件工程师 · 在做后端与 AI 工程化" 占位 OK 吗？
2. **Hero 大字**（§4）：88px 名字的视觉重量你接受吗？
3. **图片桶尺寸**（§7.4）：默认 60 张（10×6）。要更密（80 张）还是更稀（40 张）？
4. **整体信号灯**：直接开干 vs 先调一调？

回复或直接说"按你写的来"，我就开始搭 Astro 项目。
