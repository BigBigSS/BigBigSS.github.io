import {
  scene as page4Scene,
  renderer as page4Renderer,
  addResize,
  resize,
  camera as page4Camera,
  getControls,
} from "../modules/renderer.js";
import { perlin2 } from "../third_party/perlin.js";
import {
  DataTexture,
  DoubleSide,
  FloatType,
  GLSL3,
  Mesh,
  Color,
  PlaneBufferGeometry,
  RawShaderMaterial,
  RGBFormat,
  LinearFilter,
  IcosahedronBufferGeometry,
  Vector3,
  ArrowHelper,
  MeshBasicMaterial,
  Vector2,
  Group,
} from "../third_party/three.module.js";
import { clamp, randomInRange } from "../modules/Maf.js";
import { Post } from "../modules/post.js";

/**
 * 页面4模块
 */
const Page4Module = (function() {
  // 使用局部变量替代全局变量
  const scene = page4Scene;
  const renderer = page4Renderer;
  const camera = page4Camera;
  
  const post = new Post(renderer);

  // 顶点着色器
  const vertexShader = `precision highp float;

in vec3 position;
in vec2 uv;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;

uniform sampler2D displacement;

out float vHeight;
out vec2 vUv;
out vec3 vPosition;

void main() {
  float d = texture(displacement, uv).r;
  vHeight = d;
  vUv = uv;
  vPosition = position + vec3(0., .5 * (d - .5), 0.);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(vPosition, 1.);
}`;

  // 片段着色器
  const fragmentShader = `precision highp float;

out vec4 color;

uniform sampler2D gradient;
uniform sampler2D displacement;
uniform vec2 ball;
uniform float transitionFactor;

in float vHeight;
in vec2 vUv;
in vec3 vPosition;

float aastep(in float threshold, in float value) {
  float afwidth = length(vec2(dFdx(value), dFdy(value))) * 0.70710678118654757;
  return 1.-smoothstep(threshold-afwidth, threshold+afwidth, value);
}

#define PI 3.14159265359

void main() {
  vec2 uv2 = floor(vUv * 50.) / 50.;
  float d2 = texture(displacement, uv2).r;

  float lw = 2.;
  float w;

  float gx = .5 + .5 * cos(vUv.x*50.*2.*PI-PI);
  w = fwidth(vUv.x) * lw;
  gx = aastep(w, gx);

  float gy = .5 + .5 * cos(vUv.y*50.*2.*PI-PI);
  w = fwidth(vUv.y) * lw;
  gy = aastep(w, gy);

  float grid = gx + gy;
  vec2 gridColor = round(vUv * 54.) / 54.;

  float g = d2;
  color.rgb = texture(gradient, vec2(g, 0.)).rgb;
  color.rgb *= 1. - grid;

  color.rgb *= clamp(length(vPosition.xz - ball) * 50., 0., 1.);
  
  float transition = smoothstep(transitionFactor - 0.2, transitionFactor, vUv.x);
  color.rgb *= transition;
  color.a = transition;
}`;

  // 平面顶点着色器
  const planeVertexShader = `precision highp float;

in vec3 position;
in vec2 uv;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;

out vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
}`;

  // 平面片段着色器
  const planeFragmentShader = `precision highp float;

out vec4 color;

uniform sampler2D gradient;
uniform sampler2D displacement;
uniform float transitionFactor;

in vec2 vUv;

float aastep(in float threshold, in float value) {
  float afwidth = length(vec2(dFdx(value), dFdy(value))) * 0.70710678118654757;
  return 1.-smoothstep(threshold-afwidth, threshold+afwidth, value);
}

#define PI 3.14159265359

void main() {
  
  float d = texture(displacement, vUv).r;

  float lw = 1.;
  float v = .5 + .5 * sin(d*16.*2.*PI);
  float w = fwidth(d) * lw;
  v = aastep(w, v);

  color.rgb = texture(gradient, vec2(d, 0.)).rgb;
  
  float transition = smoothstep(transitionFactor - 0.2, transitionFactor, vUv.x);
  color.a = v * transition;
}`;

  // 获取three容器
  const threeContainer = document.getElementById('three-container');
  renderer.domElement.style.visibility = 'hidden';

  // 设置相机位置
  camera.position.set(1, 1, 5).normalize().multiplyScalar(2.5);
  const controls = getControls();

  // 配置控制器
  controls.enableDamping = true;
  controls.enableZoom = false;
  controls.dampingFactor = 0.05;
  controls.minPolarAngle = Math.PI / 3.1;
  controls.maxPolarAngle = Math.PI / 2.1;
  controls.target.set(0, 0.2, 0);
  controls.update();

  // 创建场景组
  const group = new Group();
  scene.add(group);
  group.position.y = 0.1;

  // 纹理尺寸设置
  const TEXTURE_WIDTH = 128;
  const TEXTURE_HEIGHT = 128;

  let max = -1000;
  let min = 1000;
  const data = new Float32Array(TEXTURE_WIDTH * TEXTURE_HEIGHT * 3);

  // 创建数据纹理
  const tex = new DataTexture(data, TEXTURE_WIDTH, TEXTURE_HEIGHT, RGBFormat, FloatType);
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;

  // 创建文字覆盖层容器，使用唯一ID
  const textOverlayId = 'page4-textOverlay';
  let textOverlay = document.getElementById(textOverlayId);
  
  if (!textOverlay) {
    textOverlay = document.createElement('div');
    textOverlay.id = textOverlayId;
    textOverlay.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      pointer-events: none;
      width: 100%;
      height: 100%;
      overflow: hidden;
    `;

    // 将textOverlay添加到three-container
    if (threeContainer) {
      threeContainer.appendChild(textOverlay);
    }
  }

  // 添加轮廓文字样式，使用唯一类名
  const styleId = 'page4-outline-text-style';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .page4-outline-text {
        position: absolute;
        color: rgba(255, 255, 255, 0.8);
        font-family: Helvetica, Arial, sans-serif;
        font-size: 14px;
        font-weight: 500;
        text-shadow: 0 0 4px rgba(0,0,0,0.6);
        white-space: nowrap;
        transform-origin: center;
        letter-spacing: 0.05em;
      }
    `;
    document.head.appendChild(style);
  }

  // 优化理论文本
  const optimizationTexts = [
    "∇f(x) = 0 • x_{k+1} = x_k - α∇f(x_k) • GRADIENT DESCENT • min f(x) s.t. g(x) ≤ 0 • CONSTRAINED OPTIMIZATION •∇²f(x) ⪰ 0 • CONVEXITY CONDITION • L(x,λ) = f(x) + λᵀg(x) • LAGRANGIAN FUNCTION • ||x_{k+1} - x*|| ≤ L||x_k - x*||² • ",
  ];

  let currentTextIndex = 0;

  /**
   * 2D旋转函数
   * @param {number} x - x坐标
   * @param {number} y - y坐标
   * @param {number} a - 旋转角度
   * @returns {Array} 旋转后的坐标
   */
  function rot2d(x, y, a) {
    return [Math.cos(a) * x - Math.sin(a) * y, Math.sin(a) * x + Math.cos(a) * y];
  }

  // 随机种子
  const seed = randomInRange(-1000, 1000);
  
  /**
   * 更新噪声纹理
   * @param {number} t - 时间参数
   */
  function updateNoise(t) {
    const r = 5;
    const ox = seed + t + r * Math.cos(t);
    const oy = r * Math.sin(t);
    const a = t * 1.1;
    const s = 2 + perlin2(t, oy);
    
    // 生成噪声数据
    for (let y = 0; y < TEXTURE_HEIGHT; y++) {
      for (let x = 0; x < TEXTURE_WIDTH; x++) {
        const [rx, ry] = rot2d(s * (x / TEXTURE_WIDTH - 0.5), s * (y / TEXTURE_HEIGHT - 0.5), a);
        const d = Math.sqrt((x - 0.5 * TEXTURE_WIDTH) ** 2 + (y - 0.5 * TEXTURE_HEIGHT) ** 2);
        const v = perlin2(rx + ox, ry + oy) + d / 100;
        min = Math.min(min, v);
        max = Math.max(max, v);
        data[(y * TEXTURE_WIDTH + x) * 3] = v;
      }
    }
    
    // 归一化数据
    for (let i = 0; i < data.length; i++) {
      data[i] = (data[i] - min) / (max - min);
    }
    tex.needsUpdate = true;
  }

  // 调色板
  const palette = [
    "#ffffff",
    "#f8f8f8",
    "#f0f0f0",
    "#e8e8e8",
    "#e0e0e0",
    "#d8d8d8",
    "#d0d0d0",
    "#c8c8c8",
  ];

  // 创建渐变纹理
  const gradientData = new Uint8Array(palette.length * 3);
  for (let i = 0; i < palette.length; i++) {
    const c = new Color(palette[i]);
    gradientData[i * 3] = c.r * 255;
    gradientData[i * 3 + 1] = c.g * 255;
    gradientData[i * 3 + 2] = c.b * 255;
  }
  const gradient = new DataTexture(gradientData, palette.length, 1, RGBFormat);
  gradient.minFilter = LinearFilter;
  gradient.magFilter = LinearFilter;

  // 创建渐变网格
  const gradientMesh = new Mesh(
    new PlaneBufferGeometry(1, 1, 32, 32),
    new RawShaderMaterial({
      uniforms: {
        displacement: { value: tex },
        gradient: { value: gradient },
        ball: { value: new Vector2() },
        transitionFactor: { value: -0.2 }
      },
      side: DoubleSide,
      vertexShader,
      fragmentShader,
      glslVersion: GLSL3,
      wireframe: !true,
      transparent: true,
    })
  );
  gradientMesh.geometry.rotateX(-Math.PI / 2);
  group.add(gradientMesh);

  // 创建平面网格
  const planeMesh = new Mesh(
    new PlaneBufferGeometry(1, 1),
    new RawShaderMaterial({
      uniforms: {
        displacement: { value: tex },
        gradient: { value: gradient },
        transitionFactor: { value: -0.2 }
      },
      side: DoubleSide,
      vertexShader: planeVertexShader,
      fragmentShader: planeFragmentShader,
      glslVersion: GLSL3,
      wireframe: !true,
      transparent: true,
    })
  );
  planeMesh.geometry.rotateX(-Math.PI / 2);
  planeMesh.position.y = -0.3;
  group.add(planeMesh);

  // 创建球体
  const ball = new Mesh(
    new IcosahedronBufferGeometry(0.02, 7),
    new MeshBasicMaterial({ 
      color: 0xffffff,
      transparent: true,
      opacity: 1
    })
  );
  group.add(ball);

  // 设置渲染器背景
  renderer.setClearColor(0x000000, 0);
  renderer.setClearAlpha(0);

  const dir = new Vector3();

  /**
   * 从3D顶点获取2D屏幕坐标
   * @param {THREE.Mesh} mesh - 网格对象
   * @param {number} sampleRate - 采样率
   * @returns {Array} 屏幕坐标点数组
   */
  function getScreenCoordinates(mesh, sampleRate = 4) {
    const points = [];
    const geometry = mesh.geometry;
    const positionAttribute = geometry.attributes.position;
    
    // 采样顶点以获得更好的轮廓
    for (let i = 0; i < positionAttribute.count; i += sampleRate) {
      const vertex = new Vector3();
      vertex.fromBufferAttribute(positionAttribute, i);
      
      // 应用网格变换
      vertex.applyMatrix4(mesh.matrixWorld);
      
      // 处理渐变网格的位移
      if (mesh === gradientMesh && geometry.attributes.uv) {
        const uv = new Vector2();
        uv.fromBufferAttribute(geometry.attributes.uv, i);
        const u = Math.floor(uv.x * TEXTURE_WIDTH);
        const v = Math.floor(uv.y * TEXTURE_HEIGHT);
        const idx = clamp(v * TEXTURE_WIDTH + u, 0, TEXTURE_WIDTH * TEXTURE_HEIGHT - 1);
        const disp = data[idx * 3];
        vertex.y += 0.5 * (disp - 0.5);
      }
      
      // 投影到屏幕
      const screenPos = vertex.project(camera);
      points.push({
        x: (screenPos.x + 1) * window.innerWidth / 2,
        y: (-screenPos.y + 1) * window.innerHeight / 2,
        z: screenPos.z
      });
    }
    
    return points;
  }

  /**
   * 叉积计算
   * @param {Object} o - 原点
   * @param {Object} a - 点A
   * @param {Object} b - 点B
   * @returns {number} 叉积结果
   */
  function cross(o, a, b) {
    return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  }

  /**
   * 凸包算法
   * @param {Array} points - 点集
   * @returns {Array} 凸包点集
   */
  function convexHull(points) {
    points = points.slice();
    points.sort((a, b) => a.x - b.x || a.y - b.y);

    const lower = [];
    for (let i = 0; i < points.length; i++) {
      while (lower.length >= 2 && 
             cross(lower[lower.length - 2], lower[lower.length - 1], points[i]) <= 0) {
        lower.pop();
      }
      lower.push(points[i]);
    }

    const upper = [];
    for (let i = points.length - 1; i >= 0; i--) {
      while (upper.length >= 2 && 
             cross(upper[upper.length - 2], upper[upper.length - 1], points[i]) <= 0) {
        upper.pop();
      }
      upper.push(points[i]);
    }

    upper.pop();
    lower.pop();
    return lower.concat(upper);
  }

  /**
   * 扩展轮廓并平滑角点
   * @param {Array} points - 轮廓点集
   * @param {number} offset - 偏移量
   * @returns {Array} 扩展后的轮廓点集
   */
  function expandOutline(points, offset) {
    const expanded = [];
    const n = points.length;
    
    for (let i = 0; i < n; i++) {
      const prev = points[(i - 1 + n) % n];
      const curr = points[i];
      const next = points[(i + 1) % n];
      
      // 计算法线
      const dx1 = curr.x - prev.x;
      const dy1 = curr.y - prev.y;
      const dx2 = next.x - curr.x;
      const dy2 = next.y - curr.y;
      
      const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
      const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
      
      // 归一化的垂直向量
      const nx1 = -dy1 / len1;
      const ny1 = dx1 / len1;
      const nx2 = -dy2 / len2;
      const ny2 = dx2 / len2;
      
      // 平均法线
      let nx = (nx1 + nx2) / 2;
      let ny = (ny1 + ny2) / 2;
      const nlen = Math.sqrt(nx * nx + ny * ny);
      nx /= nlen;
      ny /= nlen;
      
      // 扩展点
      expanded.push({
        x: curr.x + nx * - offset,
        y: curr.y + ny * - offset,
        z: curr.z
      });
    }
    
    return expanded;
  }

  /**
   * 合并两个凸包
   * @param {Array} hull1 - 凸包1
   * @param {Array} hull2 - 凸包2
   * @returns {Array} 合并后的凸包
   */
  function mergeHulls(hull1, hull2) {
    const allPoints = [...hull1, ...hull2];
    return convexHull(allPoints);
  }

  /**
   * Catmull-Rom样条插值
   * @param {Array} points - 控制点集
   * @param {number} numSegments - 每段的细分数
   * @returns {Array} 平滑后的点集
   */
  function catmullRomSpline(points, numSegments = 5) {
    const smoothed = [];
    const n = points.length;
    
    for (let i = 0; i < n; i++) {
      const p0 = points[(i - 1 + n) % n];
      const p1 = points[i];
      const p2 = points[(i + 1) % n];
      const p3 = points[(i + 2) % n];
      
      for (let t = 0; t < 1; t += 1 / numSegments) {
        const t2 = t * t;
        const t3 = t2 * t;
        
        const x = 0.5 * (
          (2 * p1.x) +
          (-p0.x + p2.x) * t +
          (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
          (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3
        );
        
        const y = 0.5 * (
          (2 * p1.y) +
          (-p0.y + p2.y) * t +
          (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
          (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3
        );
        
        smoothed.push({ x, y, z: p1.z });
      }
    }
    
    return smoothed;
  }

  /**
   * 沿轮廓放置文字
   * @param {string} text - 要放置的文字
   * @param {Array} outline - 轮廓点集
   */
  function placeTextAlongOutline(text, outline) {
    const existingElements = textOverlay.querySelectorAll('.page4-outline-text');
    const existingMap = new Map();
    
    // 保存现有元素的引用
    existingElements.forEach((el, index) => {
      existingMap.set(index, el);
    });
    
    if (outline.length < 3) {
      textOverlay.innerHTML = '';
      return;
    }
    
    // 计算轮廓周长
    let totalLength = 0;
    const segments = [];
    
    for (let i = 0; i < outline.length; i++) {
      const next = (i + 1) % outline.length;
      const dx = outline[next].x - outline[i].x;
      const dy = outline[next].y - outline[i].y;
      const length = Math.sqrt(dx * dx + dy * dy);
      segments.push({ start: i, end: next, length });
      totalLength += length;
    }
    
    // 放置字符
    const chars = text.split('');
    const charSpacing = totalLength / chars.length;
    
    chars.forEach((char, index) => {
      const targetDistance = index * charSpacing;
      let accumulatedDistance = 0;
      
      for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        
        if (accumulatedDistance + segment.length >= targetDistance) {
          const t = (targetDistance - accumulatedDistance) / segment.length;
          const p1 = outline[segment.start];
          const p2 = outline[segment.end];
          
          const x = p1.x + t * (p2.x - p1.x);
          const y = p1.y + t * (p2.y - p1.y);
          
          let textElement = existingMap.get(index);
          
          if (!textElement) {
            // 创建新元素
            textElement = document.createElement('div');
            textElement.className = 'page4-outline-text';
            textElement.textContent = char;
            textElement.style.transition = 'transform 150ms ease-out';
            textOverlay.appendChild(textElement);
          }
          
          // 使用transform而不是left/top以获得更好的性能
          textElement.style.transform = `translate(${x}px, ${y}px)`;
          
          // 从map中移除，标记为已使用
          existingMap.delete(index);
          break;
        }
        
        accumulatedDistance += segment.length;
      }
    });
    
    // 移除未使用的元素
    existingMap.forEach(el => el.remove());
  }

  // 存储前一帧的轮廓数据
  let previousOutline = null;
  let smoothedOutlineCache = null;
  let lastUpdateTime = 0;
  const UPDATE_INTERVAL = 50; // 每50ms更新一次，而不是每帧
  const LERP_FACTOR = 0.05; // 插值因子，控制平滑程度

  /**
   * 线性插值函数
   * @param {number} a - 起始值
   * @param {number} b - 结束值
   * @param {number} t - 插值因子
   * @returns {number} 插值结果
   */
  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  /**
   * 点插值函数
   * @param {Object} p1 - 起始点
   * @param {Object} p2 - 结束点
   * @param {number} t - 插值因子
   * @returns {Object} 插值点
   */
  function lerpPoint(p1, p2, t) {
    return {
      x: lerp(p1.x, p2.x, t),
      y: lerp(p1.y, p2.y, t),
      z: p1.z
    };
  }

  /**
   * 轮廓插值函数
   * @param {Array} outline1 - 起始轮廓
   * @param {Array} outline2 - 结束轮廓
   * @param {number} t - 插值因子
   * @returns {Array} 插值轮廓
   */
  function lerpOutline(outline1, outline2, t) {
    if (!outline1 || !outline2) return outline2;
    
    // 确保两个轮廓有相同数量的点
    const targetLength = Math.max(outline1.length, outline2.length);
    const resampledOutline1 = resampleOutline(outline1, targetLength);
    const resampledOutline2 = resampleOutline(outline2, targetLength);
    
    const result = [];
    for (let i = 0; i < targetLength; i++) {
      result.push(lerpPoint(resampledOutline1[i], resampledOutline2[i], t));
    }
    
    return result;
  }

  /**
   * 重采样轮廓以确保点数一致
   * @param {Array} outline - 原始轮廓
   * @param {number} targetCount - 目标点数
   * @returns {Array} 重采样后的轮廓
   */
  function resampleOutline(outline, targetCount) {
    if (outline.length === targetCount) return outline;
    
    const result = [];
    const step = outline.length / targetCount;
    
    for (let i = 0; i < targetCount; i++) {
      const index = i * step;
      const lowerIndex = Math.floor(index);
      const upperIndex = Math.ceil(index) % outline.length;
      const t = index - lowerIndex;
      
      if (lowerIndex === upperIndex) {
        result.push(outline[lowerIndex]);
      } else {
        result.push(lerpPoint(outline[lowerIndex], outline[upperIndex], t));
      }
    }
    
    return result;
  }

  /**
   * 更新轮廓和文字
   */
  function updateOutlineText() {
    const currentTime = performance.now();
    
    // 限制更新频率
    if (currentTime - lastUpdateTime < UPDATE_INTERVAL && smoothedOutlineCache) {
      // 如果还没到更新时间，使用缓存的轮廓
      placeTextAlongOutline(optimizationTexts[currentTextIndex], smoothedOutlineCache);
      return;
    }
    
    lastUpdateTime = currentTime;
    
    // 获取屏幕点 - 增加采样密度以获得更好的轮廓
    const gradientPoints = getScreenCoordinates(gradientMesh, 3);
    
    // 计算凸包
    const gradientHull = convexHull(gradientPoints);
    
    // 扩展轮廓
    const expandedOutline = expandOutline(gradientHull, 180);
    
    // 使用样条平滑轮廓
    let smoothedOutline = catmullRomSpline(expandedOutline, 8);
    
    // 应用插值以平滑过渡
    if (previousOutline) {
      smoothedOutline = lerpOutline(previousOutline, smoothedOutline, LERP_FACTOR);
    }
    
    // 更新缓存
    previousOutline = smoothedOutline;
    smoothedOutlineCache = smoothedOutline;
    
    // 放置文字
    placeTextAlongOutline(optimizationTexts[currentTextIndex], smoothedOutline);
  }

  // 定期更换文字
  let textChangeInterval = setInterval(() => {
    currentTextIndex = (currentTextIndex + 1) % optimizationTexts.length;
  }, 5000);

  /**
   * 获取梯度
   * @param {number} x - x坐标
   * @param {number} y - y坐标
   * @param {number} h - 高度
   * @param {THREE.Vector3} dir - 方向向量
   */
  function getGradient(x, y, h, dir) {
    const h0 = h - data[((y - 1) * TEXTURE_WIDTH + x) * 3];
    const h1 = h - data[((y + 1) * TEXTURE_WIDTH + x) * 3];
    const h2 = h - data[(y * TEXTURE_WIDTH + (x - 1)) * 3];
    const h3 = h - data[(y * TEXTURE_WIDTH + (x + 1)) * 3];
    const dy = h0 > h1 ? -1 : 1;
    const dx = h2 > h3 ? -1 : 1;
    dir.set(dx, 0, -dy).multiplyScalar(0.00025);
  }

  // 创建箭头辅助器
  const arrowHelper = new ArrowHelper(dir, ball.position, 0.1, 0xff00ff);

  // 控制状态
  let running = true;
  let spinning = true;

  /**
   * 键盘事件处理
   * @param {KeyboardEvent} e - 键盘事件
   */
  function handleKeyDown(e) {
    if (e.code === "Space") {
      running = !running;
    }
    if (e.code === "KeyR") {
      reset();
    }
    if (e.code === "KeyS") {
      spinning = !spinning;
    }
  }

  window.addEventListener("keydown", handleKeyDown);

  /**
   * 重置场景
   */
  function reset() {
    ball.position.set(0, 0, 0);
    speed.set(0, 0, 0);
    acc.set(0, 0, 0);
  }

  // 物理属性
  const speed = new Vector3();
  const acc = new Vector3();

  // 动画相关变量
  let frames = 0;
  let time = 0;
  let prevTime = performance.now();

  // 状态标志
  let isRendering = false;
  let isInitializing = false;
  let isDestroying = false;
  let transitionProgress = 0;
  let transitionDirection = 1;
  let transitionDuration = 1000;

  /**
   * 销毁场景
   * @param {number} duration - 过渡持续时间
   * @returns {Promise} 完成后的Promise
   */
  function destroyScene(duration = 1000) {
    return new Promise((resolve) => {
      if (isInitializing || isDestroying) return resolve();
      
      isDestroying = true;
      transitionDuration = duration;
      transitionProgress = 0;
      transitionDirection = 1;

      renderer.domElement.style.visibility = 'hidden';

      gradientMesh.material.uniforms.transitionFactor.value = -0.2;
      planeMesh.material.uniforms.transitionFactor.value = -0.2;
      ball.material.opacity = 0;
      
      // 清空文本覆盖层
      if (textOverlay) {
        textOverlay.innerHTML = '';
      }
      
      // 如果没有在渲染，触发一次渲染以显示过渡效果
      if (!isRendering) {
        render();
      }
      
      setTimeout(() => {
        // 停止渲染循环
        renderer.setAnimationLoop(null);
        isRendering = false;
        
        // 移除canvas
        const threeContainer = document.getElementById('three-container');
        if (threeContainer && renderer.domElement.parentNode === threeContainer) {
          threeContainer.removeChild(renderer.domElement);
        }
        
        // 清理事件监听器
        window.removeEventListener("keydown", handleKeyDown);
        clearInterval(textChangeInterval);
        
        // 重置场景状态
        reset();
        isDestroying = false;
        
        resolve();
      }, duration);
    });
  }

  /**
   * 初始化场景
   * @param {number} duration - 过渡持续时间
   * @returns {Promise} 完成后的Promise
   */
  function initializeScene(duration = 1000) {
    return new Promise((resolve) => {
      if (isInitializing || isDestroying) return resolve();
      
      isInitializing = true;
      
      // 确保canvas被添加到容器中
      const threeContainer = document.getElementById('three-container');
      if (threeContainer && renderer.domElement.parentNode !== threeContainer) {
        threeContainer.appendChild(renderer.domElement);
        renderer.domElement.style.position = 'absolute';
        renderer.domElement.style.top = '0';
        renderer.domElement.style.left = '0';
        renderer.domElement.style.width = '100%';
        renderer.domElement.style.height = '100%';
      }
      renderer.domElement.style.visibility = 'visible';

      // 重置初始状态
      transitionDuration = duration;
      transitionProgress = 1;
      transitionDirection = -1;
      ball.material.opacity = 1;
      
      // 重新开始渲染循环
      if (!isRendering) {
        renderer.setAnimationLoop(render);
      }
      
      setTimeout(() => {
        isInitializing = false;
        resolve();
      }, duration);
    });
  }

  /**
   * 更新过渡效果
   * @param {number} dt - 时间增量
   */
  function updateTransition(dt) {
    if (isInitializing || isDestroying) {
      transitionProgress += (dt / transitionDuration) * transitionDirection;
      transitionProgress = clamp(transitionProgress, 0, 1);
      
      const transitionFactor = transitionProgress * 1.4 - 0.2;
      
      gradientMesh.material.uniforms.transitionFactor.value = transitionFactor;
      planeMesh.material.uniforms.transitionFactor.value = transitionFactor;
    }
  }

  /**
   * 渲染循环
   */
  function render() {
    isRendering = true;
    const t = performance.now();
    const dt = t - prevTime;
    prevTime = t;

    controls.update();

    updateTransition(dt);

    if (running) {
      time += dt / 15000;
      updateNoise(time);
    }

    if (spinning) {
      group.rotation.y -= 0.001;
    }

    // 更新球体物理
    speed.add(dir);
    ball.position.add(speed);
    acc.multiplyScalar(0.99);
    speed.multiplyScalar(0.99);

    // 限制球体位置
    ball.position.x = clamp(ball.position.x, -0.5, 0.5);
    ball.position.z = clamp(ball.position.z, -0.5, 0.5);

    // 计算球体高度
    let by = TEXTURE_HEIGHT - Math.round((ball.position.z + 0.5) * TEXTURE_HEIGHT);
    let bx = Math.round((ball.position.x + 0.5) * TEXTURE_WIDTH);
    bx = clamp(bx, 1, TEXTURE_WIDTH - 2);
    by = clamp(by, 1, TEXTURE_HEIGHT - 2);

    const y = data[(by * TEXTURE_WIDTH + bx) * 3];
    ball.position.y = 0.5 * (y - 0.5) + 0.02;

    // 更新梯度
    getGradient(bx, by, y, dir);
    acc.lerp(dir, 0.1);

    // 更新箭头辅助器
    arrowHelper.position.copy(ball.position);
    arrowHelper.setDirection(dir);
    arrowHelper.setLength(0.05);

    // 更新着色器uniform
    gradientMesh.material.uniforms.ball.value.set(
      ball.position.x,
      ball.position.z
    );

    // 更新轮廓文字
    updateOutlineText();

    // 后期处理渲染
    post.render(scene, camera);

    frames++;

    renderer.setAnimationLoop(render);
  }

  /**
   * 窗口大小调整处理
   * @param {number} w - 宽度
   * @param {number} h - 高度
   * @param {number} dpr - 设备像素比
   */
  function myResize(w, h, dpr) {
    post.setSize(w * dpr, h * dpr);
  }
  addResize(myResize);

  resize();

  render();

  // 返回公共API
  return {
    initializeScene,
    destroyScene,
    cleanup: () => {
      destroyScene();
    }
  };
})();

// 保持原有的全局接口
if (typeof window !== 'undefined') {
  window.initializeScene = Page4Module.initializeScene;
  window.destroyScene = Page4Module.destroyScene;
  window.Page4Module = Page4Module;
}

export { Page4Module as default, Page4Module };