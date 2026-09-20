import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

type Explodable = THREE.Object3D & {
  userData: {
    basePosition?: [number, number, number];
    explodeVector?: [number, number, number];
  };
};

type TypewriterRuntime = {
  destroy: () => void;
};

declare global {
  interface Window {
    __brickTypewriter?: TypewriterRuntime;
  }
}

const app = document.querySelector<HTMLElement>("[data-typewriter-app]");
const canvas = document.querySelector<HTMLCanvasElement>("[data-canvas]");

if (!app || !canvas) {
  throw new Error("Brick typewriter mount point is missing");
}

const appElement = app;
const canvasElement = canvas;

window.__brickTypewriter?.destroy();

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe8e5df);
scene.fog = new THREE.Fog(0xe8e5df, 18, 34);

const camera = new THREE.PerspectiveCamera(29, 1, 0.1, 80);
const cameraHome = new THREE.Vector3(10.6, 8.3, 12.4);
camera.position.copy(cameraHome);

const renderer = new THREE.WebGLRenderer({
  canvas: canvasElement,
  antialias: true,
  alpha: false,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;

const controls = new OrbitControls(camera, canvasElement);
controls.enableDamping = true;
controls.dampingFactor = 0.075;
controls.target.set(0, 1.55, 0);
controls.minDistance = 7.5;
controls.maxDistance = 22;
controls.maxPolarAngle = Math.PI * 0.49;
controls.autoRotateSpeed = 0.8;

const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();

function createAbsBumpTexture(): THREE.CanvasTexture {
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = 128;
  textureCanvas.height = 128;
  const context = textureCanvas.getContext("2d");
  if (!context) throw new Error("ABS texture context is unavailable");

  const image = context.createImageData(textureCanvas.width, textureCanvas.height);
  let seed = 1984;
  for (let index = 0; index < image.data.length; index += 4) {
    seed = (seed * 16807) % 2147483647;
    const grain = 112 + Math.floor((seed / 2147483647) * 32);
    image.data[index] = grain;
    image.data[index + 1] = grain;
    image.data[index + 2] = grain;
    image.data[index + 3] = 255;
  }
  context.putImageData(image, 0, 0);

  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(7, 7);
  texture.anisotropy = maxAnisotropy;
  return texture;
}

const absBumpTexture = createAbsBumpTexture();

const materials = {
  red: new THREE.MeshPhysicalMaterial({
    color: 0xed1c24,
    roughness: 0.3,
    metalness: 0,
    clearcoat: 0.52,
    clearcoatRoughness: 0.24,
    bumpMap: absBumpTexture,
    bumpScale: 0.045,
  }),
  redDark: new THREE.MeshStandardMaterial({
    color: 0xa90f18,
    roughness: 0.38,
    bumpMap: absBumpTexture,
    bumpScale: 0.035,
  }),
  redAlt: new THREE.MeshPhysicalMaterial({
    color: 0xf1262c,
    roughness: 0.31,
    metalness: 0,
    clearcoat: 0.5,
    clearcoatRoughness: 0.25,
    bumpMap: absBumpTexture,
    bumpScale: 0.04,
  }),
  yellow: new THREE.MeshPhysicalMaterial({
    color: 0xffc400,
    roughness: 0.29,
    clearcoat: 0.56,
    clearcoatRoughness: 0.22,
    bumpMap: absBumpTexture,
    bumpScale: 0.042,
  }),
  black: new THREE.MeshPhysicalMaterial({
    color: 0x111214,
    roughness: 0.34,
    clearcoat: 0.32,
    bumpMap: absBumpTexture,
    bumpScale: 0.036,
  }),
  blackSoft: new THREE.MeshStandardMaterial({
    color: 0x25262a,
    roughness: 0.54,
    bumpMap: absBumpTexture,
    bumpScale: 0.03,
  }),
  steel: new THREE.MeshStandardMaterial({
    color: 0xaab0b6,
    roughness: 0.22,
    metalness: 0.86,
  }),
  paper: new THREE.MeshStandardMaterial({
    color: 0xfffdf5,
    roughness: 0.88,
    side: THREE.DoubleSide,
  }),
};

Object.values(materials).forEach((material) => {
  const map = "map" in material ? material.map : null;
  if (map) map.anisotropy = maxAnisotropy;
});

const model = new THREE.Group();
model.name = "BrickTypewriter";
model.rotation.y = -0.12;
model.position.y = -0.35;
scene.add(model);

const explodables: Explodable[] = [];
const keyGroups: THREE.Group[] = [];
const keyBindings = new Map<string, THREE.Group>();
const typebarPivots: THREE.Group[] = [];
const partMeshes: THREE.Mesh[] = [];

function registerPart<T extends THREE.Object3D>(
  object: T,
  name: string,
  explodeVector: THREE.Vector3,
): T {
  object.name = name;
  const part = object as T & Explodable;
  part.userData.basePosition = object.position.toArray();
  part.userData.explodeVector = explodeVector.toArray();
  explodables.push(part);
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      child.name ||= `${name}_mesh`;
      partMeshes.push(child);
    }
  });
  return object;
}

function roundedMesh(
  size: [number, number, number],
  material: THREE.Material,
  radius = 0.1,
  segments = 3,
): THREE.Mesh {
  return new THREE.Mesh(
    new RoundedBoxGeometry(size[0], size[1], size[2], segments, radius),
    material,
  );
}

function cylinder(
  radius: number,
  length: number,
  material: THREE.Material,
  radialSegments = 24,
): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, length, radialSegments),
    material,
  );
}

function linkBetween(
  start: THREE.Vector3,
  end: THREE.Vector3,
  width: number,
  depth: number,
  material: THREE.Material,
): THREE.Mesh {
  const midpoint = start.clone().add(end).multiplyScalar(0.5);
  const direction = end.clone().sub(start);
  const mesh = roundedMesh([width, direction.length(), depth], material, width * 0.34, 2);
  mesh.position.copy(midpoint);
  mesh.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction.clone().normalize(),
  );
  return mesh;
}

function addStudGrid(
  parent: THREE.Object3D,
  columns: number,
  rows: number,
  spacing: number,
  origin: THREE.Vector3,
  material: THREE.Material,
  axis: "x" | "y" | "z" = "y",
): void {
  const studHeight = 0.105;
  const studGeometry = new THREE.CylinderGeometry(0.14, 0.145, studHeight, 24);
  const capGeometry = new THREE.CylinderGeometry(0.102, 0.102, 0.012, 24);
  const studs = new THREE.InstancedMesh(studGeometry, material, columns * rows);
  const caps = new THREE.InstancedMesh(capGeometry, material, columns * rows);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  if (axis === "z") quaternion.setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
  if (axis === "x") quaternion.setFromEuler(new THREE.Euler(0, 0, -Math.PI / 2));
  let index = 0;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const columnOffset = (column - (columns - 1) / 2) * spacing;
      const rowOffset = (row - (rows - 1) / 2) * spacing;
      const x = origin.x + (axis === "x" ? 0 : columnOffset);
      const y = origin.y + (axis === "y" ? 0 : rowOffset);
      const z =
        origin.z + (axis === "x" ? columnOffset : axis === "y" ? rowOffset : 0);
      matrix.compose(
        new THREE.Vector3(x, y, z),
        quaternion,
        new THREE.Vector3(1, 1, 1),
      );
      studs.setMatrixAt(index, matrix);

      const capPosition = new THREE.Vector3(x, y, z);
      if (axis === "x") capPosition.x += studHeight * 0.55;
      if (axis === "y") capPosition.y += studHeight * 0.55;
      if (axis === "z") capPosition.z += studHeight * 0.55;
      matrix.compose(capPosition, quaternion, new THREE.Vector3(1, 1, 1));
      caps.setMatrixAt(index, matrix);
      index += 1;
    }
  }
  studs.castShadow = true;
  studs.receiveShadow = true;
  studs.name = "StudArray";
  caps.castShadow = true;
  caps.receiveShadow = true;
  caps.name = "StudCapArray";
  parent.add(studs, caps);
}

const STUD_PITCH = 0.48;
const BRICK_GAP = 0.026;
const BRICK_HEIGHT = 0.54;

function addWingBrickWall(parent: THREE.Group): void {
  const wall = new THREE.Group();
  wall.rotation.x = -0.045;

  const backing = roundedMesh([0.7, 1.68, 4.72], materials.redDark, 0.05, 2);
  wall.add(backing);

  const patterns = [
    [2, 2, 2, 2, 2],
    [1, 2, 2, 2, 2, 1],
    [2, 2, 2, 2, 2],
  ];

  patterns.forEach((pattern, row) => {
    let cursor = -STUD_PITCH * 5;
    const y = (row - 1) * (BRICK_HEIGHT + BRICK_GAP);
    pattern.forEach((studCount, column) => {
      const depth = studCount * STUD_PITCH - BRICK_GAP;
      const brickMaterial =
        (row + column) % 3 === 0 ? materials.redAlt : materials.red;
      const brick = roundedMesh(
        [0.82, BRICK_HEIGHT, depth],
        brickMaterial,
        0.038,
        2,
      );
      brick.position.set(0, y, cursor + (studCount * STUD_PITCH) / 2);
      wall.add(brick);
      cursor += studCount * STUD_PITCH;

      if (row === patterns.length - 1) {
        addStudGrid(
          wall,
          2,
          studCount,
          STUD_PITCH,
          new THREE.Vector3(0, y + BRICK_HEIGHT / 2 + 0.045, brick.position.z),
          brickMaterial,
        );
      }
    });
  });

  parent.add(wall);
}

function addCrownBricks(parent: THREE.Group): void {
  const crown = new THREE.Group();
  crown.position.set(0, 0.99, -0.72);
  crown.rotation.x = -0.08;
  const pattern = [3, 2];
  let cursor = -STUD_PITCH * 2.5;

  pattern.forEach((studCount, index) => {
    const depth = studCount * STUD_PITCH - BRICK_GAP;
    const brick = roundedMesh([0.88, 0.34, depth], materials.yellow, 0.04, 2);
    brick.position.z = cursor + (studCount * STUD_PITCH) / 2;
    crown.add(brick);
    addStudGrid(
      crown,
      2,
      studCount,
      STUD_PITCH,
      new THREE.Vector3(0, 0.215, brick.position.z),
      materials.yellow,
    );
    cursor += studCount * STUD_PITCH;
    brick.name = `CrownBrick_${index}`;
  });

  parent.add(crown);
}

function buildBody(): void {
  const base = new THREE.Group();
  base.position.set(0, 0.32, 0.35);
  base.add(roundedMesh([8.4, 0.58, 5.8], materials.red, 0.13, 3));

  const lowerInset = roundedMesh([7.95, 0.2, 5.38], materials.black, 0.12, 3);
  lowerInset.position.y = -0.36;
  base.add(lowerInset);

  const frontBacking = roundedMesh([7.74, 0.42, 0.14], materials.redDark, 0.03, 2);
  frontBacking.position.set(0, 0.05, 2.9);
  base.add(frontBacking);
  for (let index = 0; index < 8; index += 1) {
    const frontBrick = roundedMesh(
      [0.94, 0.4, 0.17],
      index % 3 === 0 ? materials.redAlt : materials.red,
      0.035,
      2,
    );
    frontBrick.position.set((index - 3.5) * 0.96, 0.06, 2.94);
    base.add(frontBrick);
  }

  for (const x of [-3.42, 3.42]) {
    const foot = roundedMesh([0.68, 0.24, 0.72], materials.black, 0.08, 2);
    foot.position.set(x, -0.48, 2.15);
    base.add(foot);
  }

  for (let index = 0; index < 14; index += 1) {
    const plateMaterial = index % 4 === 0 ? materials.redAlt : materials.red;
    const plate = roundedMesh(
      [0.45, 0.12, 1.38],
      plateMaterial,
      0.025,
      2,
    );
    plate.position.set((index - 6.5) * STUD_PITCH, 0.34, 2.02);
    base.add(plate);
    addStudGrid(
      base,
      1,
      3,
      STUD_PITCH,
      new THREE.Vector3(plate.position.x, 0.45, plate.position.z),
      plateMaterial,
    );
  }
  model.add(registerPart(base, "BaseShell", new THREE.Vector3(0, -1.2, 0)));

  const leftWing = new THREE.Group();
  leftWing.position.set(-3.72, 1.15, -0.05);
  addWingBrickWall(leftWing);
  addCrownBricks(leftWing);
  model.add(registerPart(leftWing, "LeftHousing", new THREE.Vector3(-2.1, 0.7, 0)));

  const rightWing = leftWing.clone();
  rightWing.position.x = 3.72;
  model.add(registerPart(rightWing, "RightHousing", new THREE.Vector3(2.1, 0.7, 0)));

  const keyboardDeck = roundedMesh([6.65, 0.32, 2.5], materials.blackSoft, 0.14, 3);
  keyboardDeck.position.set(0, 0.78, 1.28);
  keyboardDeck.rotation.x = -0.1;
  model.add(registerPart(keyboardDeck, "KeyboardDeck", new THREE.Vector3(0, 0, 2)));

  const upperRedBand = new THREE.Group();
  upperRedBand.position.set(0, 1.56, -0.02);
  const upperBacking = roundedMesh([6.76, 0.54, 0.4], materials.redDark, 0.035, 2);
  upperRedBand.add(upperBacking);
  const bandPattern = [3, 4, 4, 3];
  let bandCursor = -STUD_PITCH * 7;
  bandPattern.forEach((studCount, index) => {
    const width = studCount * STUD_PITCH - BRICK_GAP;
    const bandMaterial = index % 2 === 0 ? materials.redAlt : materials.red;
    const bandBrick = roundedMesh(
      [width, 0.56, 0.48],
      bandMaterial,
      0.04,
      2,
    );
    bandBrick.position.x = bandCursor + (studCount * STUD_PITCH) / 2;
    upperRedBand.add(bandBrick);
    addStudGrid(
      upperRedBand,
      studCount,
      1,
      STUD_PITCH,
      new THREE.Vector3(bandBrick.position.x, 0.335, 0),
      bandMaterial,
    );
    bandCursor += studCount * STUD_PITCH;
  });
  model.add(registerPart(upperRedBand, "UpperFrontBand", new THREE.Vector3(0, 0.6, 1.6)));
}

function buildKeyboard(): void {
  const keyboard = new THREE.Group();
  keyboard.position.set(0, 0.83, 0.64);
  keyboard.rotation.x = -0.12;

  const rowCounts = [10, 11, 10, 10];
  const rowLabels = [
    [..."QWERTYUIOP"],
    [..."ASDFGHJKL;'"],
    [..."ZXCVBNM,./"],
    [..."1234567890"],
  ];
  const rowZ = [1.05, 0.5, -0.06, -0.62];
  const spacing = 0.56;
  let keyIndex = 0;

  rowCounts.forEach((count, row) => {
    const offset = row % 2 === 1 ? 0.12 : 0;
    for (let column = 0; column < count; column += 1) {
      const key = new THREE.Group();
      const x = (column - (count - 1) / 2) * spacing + offset;
      key.position.set(x, row * 0.035, rowZ[row]);
      key.name = `Key_${String(keyIndex).padStart(2, "0")}`;
      key.userData.restY = key.position.y;

      const stem = cylinder(0.105, 0.28, materials.black, 16);
      stem.position.y = 0.08;
      key.add(stem);

      const ring = cylinder(0.225, 0.11, materials.yellow, 24);
      ring.position.y = 0.26;
      key.add(ring);

      const cap = cylinder(0.168, 0.12, materials.blackSoft, 24);
      cap.position.y = 0.33;
      key.add(cap);
      keyboard.add(key);
      keyGroups.push(key);
      keyBindings.set(rowLabels[row][column], key);
      keyIndex += 1;
    }
  });

  const spaceKey = new THREE.Group();
  spaceKey.position.set(0, -0.02, 1.7);
  spaceKey.userData.restY = spaceKey.position.y;
  const spaceBar = roundedMesh([3.45, 0.2, 0.38], materials.black, 0.14, 4);
  spaceKey.add(spaceBar);
  keyboard.add(spaceKey);
  keyGroups.push(spaceKey);
  keyBindings.set(" ", spaceKey);

  for (const x of [-3.12, 3.12]) {
    const accent = new THREE.Group();
    accent.position.set(x, 0.02, 1.03);
    accent.name = `AccentKey_${x < 0 ? "L" : "R"}`;
    accent.userData.restY = accent.position.y;
    const stem = cylinder(0.12, 0.25, materials.black, 16);
    stem.position.y = 0.08;
    const cap = cylinder(0.25, 0.14, materials.yellow, 24);
    cap.position.y = 0.28;
    accent.add(stem, cap);
    keyboard.add(accent);
    keyGroups.push(accent);
    keyBindings.set(x < 0 ? "BACKSPACE" : "ENTER", accent);
  }

  model.add(registerPart(keyboard, "KeyboardAssembly", new THREE.Vector3(0, 0.2, 2.3)));
}

function buildTypebars(): void {
  const basket = new THREE.Group();
  basket.position.set(0, 1.42, -0.44);

  const basketPlate = roundedMesh([5.2, 0.18, 1.65], materials.black, 0.14, 3);
  basketPlate.position.set(0, -0.13, 0.08);
  basketPlate.rotation.x = -0.12;
  basket.add(basketPlate);

  const count = 24;
  for (let index = 0; index < count; index += 1) {
    const ratio = index / (count - 1);
    const x = THREE.MathUtils.lerp(-2.35, 2.35, ratio);
    const pivot = new THREE.Group();
    pivot.position.set(x * 0.7, -0.02, 0.58);
    pivot.name = `Typebar_${String(index).padStart(2, "0")}`;
    pivot.userData.restRotationX = 0;

    const start = new THREE.Vector3(0, 0, 0);
    const end = new THREE.Vector3(x * 0.3, 0.72 + Math.abs(x) * 0.06, -0.88);
    const arm = linkBetween(start, end, 0.075, 0.07, materials.steel);
    pivot.add(arm);

    const slug = roundedMesh([0.16, 0.16, 0.09], materials.blackSoft, 0.025, 2);
    slug.position.copy(end);
    slug.rotation.x = -0.35;
    pivot.add(slug);

    basket.add(pivot);
    typebarPivots.push(pivot);
  }

  const guide = new THREE.Mesh(
    new THREE.TorusGeometry(1.46, 0.08, 12, 72, Math.PI),
    materials.steel,
  );
  guide.rotation.set(Math.PI / 2, 0, 0);
  guide.position.set(0, 0.17, -0.12);
  basket.add(guide);

  model.add(registerPart(basket, "TypebarBasket", new THREE.Vector3(0, 1.5, 0.4)));
}

const paperCanvas = document.createElement("canvas");
paperCanvas.width = 1024;
paperCanvas.height = 640;
const PAPER_WORLD_WIDTH = 5.55;
const PAPER_TEXT_LEFT = 104;
const PAPER_TEXT_RIGHT = 104;
const PAPER_TEXT_TOP = 190;
const PAPER_LINE_HEIGHT = 68;
const PAPER_MAX_LINES = 5;
const PAPER_FONT = "700 52px monospace";
const paperContext = paperCanvas.getContext("2d");
if (!paperContext) throw new Error("Canvas 2D context is unavailable");
const paperDrawingContext = paperContext;
paperDrawingContext.font = PAPER_FONT;
const PAPER_GLYPH_WIDTH = paperDrawingContext.measureText("M").width;
const PAPER_MAX_COLUMNS = Math.floor(
  (paperCanvas.width - PAPER_TEXT_LEFT - PAPER_TEXT_RIGHT) / PAPER_GLYPH_WIDTH,
);
const PAPER_WORLD_PER_PIXEL = PAPER_WORLD_WIDTH / paperCanvas.width;
const CARRIAGE_LINE_START_X =
  PAPER_WORLD_WIDTH / 2 - PAPER_TEXT_LEFT * PAPER_WORLD_PER_PIXEL;
const CARRIAGE_CHARACTER_STEP = PAPER_GLYPH_WIDTH * PAPER_WORLD_PER_PIXEL;
const CARRIAGE_LINE_END_X =
  CARRIAGE_LINE_START_X - PAPER_MAX_COLUMNS * CARRIAGE_CHARACTER_STEP;

const paperTexture = new THREE.CanvasTexture(paperCanvas);
paperTexture.colorSpace = THREE.SRGBColorSpace;
paperTexture.anisotropy = maxAnisotropy;
paperTexture.wrapS = THREE.ClampToEdgeWrapping;
paperTexture.wrapT = THREE.ClampToEdgeWrapping;
const paperMaterial = new THREE.MeshStandardMaterial({
  map: paperTexture,
  roughness: 0.92,
  side: THREE.DoubleSide,
});

type PaperLayout = {
  lines: string[];
  row: number;
  column: number;
};

function layoutDocument(text: string): PaperLayout {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    if (paragraph.length === 0) {
      lines.push("");
      continue;
    }
    for (let offset = 0; offset < paragraph.length; offset += PAPER_MAX_COLUMNS) {
      lines.push(paragraph.slice(offset, offset + PAPER_MAX_COLUMNS));
    }
  }

  const lastLine = lines.at(-1) ?? "";
  return {
    lines,
    row: Math.max(lines.length - 1, 0),
    column: lastLine.length,
  };
}

function paintPaper(lines: string[] = [""]): void {
  paperDrawingContext.fillStyle = "#fffdf5";
  paperDrawingContext.fillRect(0, 0, paperCanvas.width, paperCanvas.height);
  paperDrawingContext.strokeStyle = "#d8d2c5";
  paperDrawingContext.lineWidth = 2;

  for (let y = 28; y < paperCanvas.height; y += 32) {
    paperDrawingContext.beginPath();
    paperDrawingContext.arc(24, y, 6, 0, Math.PI * 2);
    paperDrawingContext.arc(paperCanvas.width - 24, y, 6, 0, Math.PI * 2);
    paperDrawingContext.stroke();
  }

  paperDrawingContext.fillStyle = "#171717";
  paperDrawingContext.font = PAPER_FONT;
  paperDrawingContext.textBaseline = "top";
  lines.forEach((line, index) => {
    paperDrawingContext.fillText(
      line,
      PAPER_TEXT_LEFT,
      PAPER_TEXT_TOP + index * PAPER_LINE_HEIGHT,
    );
  });
  paperTexture.needsUpdate = true;
}

paintPaper();

const carriage = new THREE.Group();
let carriageReturnLever: THREE.Group | null = null;

function buildCarriage(): void {
  carriage.name = "CarriageAssembly";
  carriage.position.set(0, 0, 0);

  const rearRail = cylinder(0.09, 8.2, materials.steel, 20);
  rearRail.rotation.z = Math.PI / 2;
  rearRail.position.set(0, 2.35, -1.84);
  carriage.add(rearRail);

  const platen = cylinder(0.39, 7.2, materials.black, 32);
  platen.rotation.z = Math.PI / 2;
  platen.position.set(0, 2.7, -1.56);
  platen.name = "PlatenRoller";
  carriage.add(platen);

  const paper = new THREE.Mesh(
    new THREE.PlaneGeometry(PAPER_WORLD_WIDTH, 3.35, 12, 12),
    paperMaterial,
  );
  paper.position.set(0, 4.08, -1.67);
  paper.rotation.x = -0.035;
  paper.name = "Paper";
  paper.castShadow = true;
  paper.receiveShadow = true;
  carriage.add(paper);

  for (const x of [-3.82, 3.82]) {
    const knob = cylinder(0.44, 0.38, materials.yellow, 28);
    knob.rotation.z = Math.PI / 2;
    knob.position.set(x, 2.7, -1.56);
    knob.name = x < 0 ? "LeftPlatenKnob" : "RightPlatenKnob";
    carriage.add(knob);

    const hub = cylinder(0.18, 0.42, materials.black, 20);
    hub.rotation.z = Math.PI / 2;
    hub.position.set(x + (x < 0 ? -0.05 : 0.05), 2.7, -1.56);
    carriage.add(hub);
  }

  for (const x of [-2.5, 2.5]) {
    const support = roundedMesh([0.12, 1.35, 0.12], materials.black, 0.04, 2);
    support.position.set(x, 4.12, -1.79);
    support.rotation.z = x < 0 ? -0.05 : 0.05;
    carriage.add(support);
  }

  const leverPivot = new THREE.Group();
  leverPivot.name = "CarriageReturnLever";
  leverPivot.position.set(-3.62, 2.98, -1.52);
  leverPivot.userData.restRotationZ = -0.22;
  leverPivot.rotation.z = -0.22;
  const leverArm = roundedMesh([2.25, 0.12, 0.12], materials.steel, 0.05, 2);
  leverArm.position.x = -1.08;
  const leverGrip = roundedMesh([0.72, 0.24, 0.27], materials.black, 0.08, 3);
  leverGrip.position.x = -2.25;
  leverPivot.add(leverArm, leverGrip);
  carriage.add(leverPivot);
  carriageReturnLever = leverPivot;

  model.add(registerPart(carriage, "Carriage", new THREE.Vector3(0, 1.8, -1.6)));
}

function buildRibbonSystem(): void {
  const ribbon = new THREE.Group();
  ribbon.position.set(0, 2.05, -0.56);

  for (const x of [-2.18, 2.18]) {
    const spool = new THREE.Group();
    spool.position.x = x;
    const lower = cylinder(0.7, 0.16, materials.black, 36);
    const core = cylinder(0.48, 0.34, materials.blackSoft, 28);
    core.position.y = 0.12;
    const upper = cylinder(0.7, 0.12, materials.black, 36);
    upper.position.y = 0.28;
    const hub = cylinder(0.13, 0.18, materials.yellow, 20);
    hub.position.y = 0.4;
    spool.add(lower, core, upper, hub);
    ribbon.add(spool);
  }

  const ribbonBand = roundedMesh([4.35, 0.12, 0.12], materials.redDark, 0.03, 2);
  ribbonBand.position.set(0, 0.16, -0.05);
  ribbon.add(ribbonBand);

  const vibrator = roundedMesh([0.38, 0.72, 0.12], materials.steel, 0.06, 2);
  vibrator.position.set(0, 0.4, -0.2);
  ribbon.add(vibrator);

  model.add(registerPart(ribbon, "RibbonAssembly", new THREE.Vector3(0, 1.6, -0.4)));
}

function buildAccentDetails(): void {
  const rail = roundedMesh([6.45, 0.12, 0.12], materials.steel, 0.04, 2);
  rail.position.set(0, 2.22, -1.28);
  model.add(registerPart(rail, "CarriageGuide", new THREE.Vector3(0, 1.1, -1)));

  const sideBadge = new THREE.Group();
  sideBadge.position.set(4.13, 1.16, -0.5);
  const sidePlate = roundedMesh([0.16, 0.55, 1.55], materials.yellow, 0.045, 2);
  sideBadge.add(sidePlate);
  addStudGrid(
    sideBadge,
    3,
    1,
    STUD_PITCH,
    new THREE.Vector3(0.13, 0, 0),
    materials.yellow,
    "x",
  );
  model.add(registerPart(sideBadge, "SideAccent", new THREE.Vector3(1.4, 0.3, 0)));
}

buildBody();
buildKeyboard();
buildTypebars();
buildRibbonSystem();
buildCarriage();
buildAccentDetails();

model.traverse((object) => {
  if (object instanceof THREE.Mesh) {
    object.castShadow = true;
    object.receiveShadow = true;
  }
});

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(60, 60),
  new THREE.ShadowMaterial({ color: 0x3b352e, opacity: 0.16 }),
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.55;
floor.receiveShadow = true;
scene.add(floor);

const hemisphere = new THREE.HemisphereLight(0xffffff, 0xb9afa1, 2.1);
scene.add(hemisphere);

const keyLight = new THREE.DirectionalLight(0xfff7e8, 4.2);
keyLight.position.set(-6, 10, 8);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.near = 1;
keyLight.shadow.camera.far = 32;
keyLight.shadow.camera.left = -9;
keyLight.shadow.camera.right = 9;
keyLight.shadow.camera.top = 9;
keyLight.shadow.camera.bottom = -9;
keyLight.shadow.bias = -0.0003;
scene.add(keyLight);

const rimLight = new THREE.DirectionalLight(0xffc400, 2.2);
rimLight.position.set(7, 5, -8);
scene.add(rimLight);

const fillLight = new THREE.DirectionalLight(0x9fc9ff, 1.3);
fillLight.position.set(5, 4, 7);
scene.add(fillLight);

type InputSource = "auto" | "live";
type InputAction =
  | { kind: "insert"; character: string; binding: string; source: InputSource }
  | { kind: "enter"; character: "\n"; binding: "ENTER"; source: InputSource }
  | { kind: "backspace"; character: ""; binding: "BACKSPACE"; source: InputSource }
  | { kind: "softReturn"; character: "\n"; binding: "ENTER"; source: InputSource };

const printMessage = "MAKE SOMETHING\nBOLD.";
let liveKey: THREE.Group | null = null;
let liveTypebar: THREE.Group | null = null;
let livePulseTimer = -1;
let livePulseDuration = 0.13;
let liveLeverPulse = false;
let typedText = "";
let projectedText = "";
const inputQueue: InputAction[] = [];
let carriageOffsetX = CARRIAGE_LINE_START_X;
let carriageTargetX = CARRIAGE_LINE_START_X;
let carriageDamping = 24;
let printing = false;
let explodeTarget = 0;
let explodeAmount = 0;
let destroyed = false;
let previousFrameTime = performance.now();

const statusLabel = document.querySelector<HTMLElement>("[data-status]");
const partCount = document.querySelector<HTMLElement>("[data-part-count]");
const loading = document.querySelector<HTMLElement>("[data-loading]");
const reference = document.querySelector<HTMLElement>("[data-reference]");
const referenceButton = document.querySelector<HTMLButtonElement>('[data-action="reference"]');
const actionButtons = Array.from(
  document.querySelectorAll<HTMLButtonElement>("[data-action]"),
);

if (partCount) partCount.textContent = String(partMeshes.length).padStart(3, "0");

function setStatus(value: string): void {
  if (statusLabel) statusLabel.textContent = value;
}

function resetLivePose(): void {
  if (liveKey) {
    liveKey.position.y = Number(liveKey.userData.restY ?? 0);
    liveKey = null;
  }
  if (liveTypebar) {
    liveTypebar.rotation.x = Number(liveTypebar.userData.restRotationX ?? 0);
    liveTypebar = null;
  }
  if (carriageReturnLever) {
    carriageReturnLever.rotation.z = Number(
      carriageReturnLever.userData.restRotationZ ?? -0.22,
    );
  }
  liveLeverPulse = false;
}

function columnToCarriageX(column: number): number {
  return THREE.MathUtils.clamp(
    CARRIAGE_LINE_START_X - column * CARRIAGE_CHARACTER_STEP,
    CARRIAGE_LINE_END_X,
    CARRIAGE_LINE_START_X,
  );
}

function bindingForCharacter(character: string): string {
  if (/^[a-zA-Z]$/.test(character)) return character.toUpperCase();
  if (/^[0-9]$/.test(character)) return character;
  const shiftedBindings: Record<string, string> = {
    "!": "1",
    '"': "'",
    "?": "/",
    ":": ";",
    "_": "/",
    "(": "9",
    ")": "0",
  };
  return shiftedBindings[character] ?? character;
}

function bindingFromKeyboardEvent(event: KeyboardEvent): string {
  if (event.code.startsWith("Key")) return event.code.slice(3);
  if (event.code.startsWith("Digit")) return event.code.slice(5);
  const bindings: Record<string, string> = {
    Space: " ",
    Enter: "ENTER",
    Backspace: "BACKSPACE",
    Semicolon: ";",
    Quote: "'",
    Comma: ",",
    Period: ".",
    Slash: "/",
    Minus: "/",
  };
  return bindings[event.code] ?? bindingForCharacter(event.key);
}

function typebarForBinding(binding: string): THREE.Group | null {
  if (binding.length !== 1 || binding === " ") return null;
  const normalized = binding.toUpperCase().charCodeAt(0);
  return typebarPivots[normalized % typebarPivots.length] ?? null;
}

function applyTextAction(text: string, action: InputAction): string {
  if (action.kind === "insert") return text + action.character;
  if (action.kind === "enter") return text + "\n";
  if (action.kind === "backspace") return text.slice(0, -1);
  return text;
}

function triggerLiveMechanism(action: InputAction, carriageReturn: boolean): void {
  resetLivePose();
  liveKey = keyBindings.get(action.binding) ?? null;
  liveTypebar =
    action.kind === "insert" ? typebarForBinding(action.binding) : null;
  liveLeverPulse = carriageReturn;
  livePulseDuration = carriageReturn ? 0.34 : 0.13;
  livePulseTimer = 0;
}

function updateLivePulse(delta: number): void {
  if (livePulseTimer < 0) return;
  livePulseTimer += delta;
  const progress = THREE.MathUtils.clamp(livePulseTimer / livePulseDuration, 0, 1);
  const pulse = Math.sin(progress * Math.PI);

  if (liveKey) {
    liveKey.position.y = Number(liveKey.userData.restY ?? 0) - pulse * 0.14;
  }
  if (liveTypebar) {
    liveTypebar.rotation.x =
      Number(liveTypebar.userData.restRotationX ?? 0) - pulse * 0.78;
  }
  if (liveLeverPulse && carriageReturnLever) {
    carriageReturnLever.rotation.z =
      Number(carriageReturnLever.userData.restRotationZ ?? -0.22) - pulse * 0.48;
  }

  if (progress >= 1) {
    resetLivePose();
    livePulseTimer = -1;
  }
}

function cancelQueuedInput(): void {
  inputQueue.length = 0;
  projectedText = typedText;
  resetLivePose();
  livePulseTimer = -1;
}

function enqueueInput(action: InputAction): boolean {
  if (action.source === "live" && printing) {
    printing = false;
    cancelQueuedInput();
  }

  const before = layoutDocument(projectedText);
  const candidate = applyTextAction(projectedText, action);
  const after = layoutDocument(candidate);

  if (after.lines.length > PAPER_MAX_LINES || inputQueue.length >= 64) {
    if (action.source === "live") setStatus("PAPER FULL");
    return false;
  }

  if (
    action.kind === "insert" &&
    before.column === PAPER_MAX_COLUMNS &&
    after.row > before.row
  ) {
    inputQueue.push({
      kind: "softReturn",
      character: "\n",
      binding: "ENTER",
      source: action.source,
    });
  }

  inputQueue.push(action);
  projectedText = candidate;
  return true;
}

function startNextInput(): void {
  if (livePulseTimer >= 0) return;
  const action = inputQueue.shift();

  if (!action) {
    projectedText = typedText;
    if (printing) {
      printing = false;
      setStatus("COMPLETE");
    }
    return;
  }

  const carriageReturn = action.kind === "enter" || action.kind === "softReturn";
  if (action.kind !== "softReturn") {
    typedText = applyTextAction(typedText, action);
    const layout = layoutDocument(typedText);
    paintPaper(layout.lines);
    carriageTargetX = columnToCarriageX(layout.column);
  } else {
    carriageTargetX = CARRIAGE_LINE_START_X;
  }

  carriageDamping = carriageReturn ? 11 : 26;
  triggerLiveMechanism(action, carriageReturn);

  if (action.source === "live") {
    const layout = layoutDocument(typedText);
    if (action.kind === "softReturn") setStatus("AUTO RETURN");
    else if (action.kind === "enter") setStatus("NEW LINE");
    else if (action.kind === "backspace") setStatus("ERASING");
    else if (layout.column === PAPER_MAX_COLUMNS) setStatus("MARGIN");
    else setStatus("LIVE INPUT");
  }
}

function updateInput(delta: number): void {
  updateLivePulse(delta);
  if (livePulseTimer < 0) startNextInput();
}

function updateCarriage(delta: number): void {
  carriageOffsetX = THREE.MathUtils.damp(
    carriageOffsetX,
    carriageTargetX,
    carriageDamping,
    delta,
  );
}

function startPrint(): void {
  cancelQueuedInput();
  typedText = "";
  projectedText = "";
  carriageOffsetX = CARRIAGE_LINE_START_X;
  carriageTargetX = CARRIAGE_LINE_START_X;
  paintPaper();
  printing = true;

  for (const character of printMessage) {
    if (character === "\n") {
      enqueueInput({
        kind: "enter",
        character: "\n",
        binding: "ENTER",
        source: "auto",
      });
    } else {
      enqueueInput({
        kind: "insert",
        character,
        binding: bindingForCharacter(character),
        source: "auto",
      });
    }
  }
  setStatus("TYPING");
}

function updateExplosion(delta: number): void {
  explodeAmount = THREE.MathUtils.damp(explodeAmount, explodeTarget, 6.5, delta);
  for (const object of explodables) {
    const base = object.userData.basePosition;
    const vector = object.userData.explodeVector;
    if (!base || !vector) continue;
    object.position.set(
      base[0] + vector[0] * explodeAmount + (object === carriage ? carriageOffsetX : 0),
      base[1] + vector[1] * explodeAmount,
      base[2] + vector[2] * explodeAmount,
    );
  }
}

function handleKeyboardInput(event: KeyboardEvent): void {
  const target = event.target;
  if (
    target instanceof HTMLElement &&
    (target.matches("input, textarea, select") || target.isContentEditable)
  ) {
    return;
  }
  if (event.metaKey || event.ctrlKey || event.altKey) return;

  const key = event.key;
  let action: InputAction;

  if (/^[a-zA-Z0-9 .,;:'"!?_()/\-]$/.test(key)) {
    action = {
      kind: "insert",
      character: key,
      binding: bindingFromKeyboardEvent(event),
      source: "live",
    };
  } else if (key === "Enter") {
    action = {
      kind: "enter",
      character: "\n",
      binding: "ENTER",
      source: "live",
    };
  } else if (key === "Backspace") {
    action = {
      kind: "backspace",
      character: "",
      binding: "BACKSPACE",
      source: "live",
    };
  } else {
    return;
  }

  event.preventDefault();
  if (enqueueInput(action)) {
    setStatus(key === "Enter" ? "NEW LINE" : key === "Backspace" ? "ERASING" : "LIVE INPUT");
  }
}

function resetView(): void {
  controls.autoRotate = false;
  const rotateButton = document.querySelector<HTMLButtonElement>('[data-action="rotate"]');
  rotateButton?.setAttribute("aria-pressed", "false");
  camera.position.copy(cameraHome);
  controls.target.set(0, 1.55, 0);
  if (isPhoneEmbedded()) resize();
  controls.update();
  setStatus("READY");
}

function createExportAnimation(): THREE.AnimationClip {
  const carriageTrack = new THREE.VectorKeyframeTrack(
    "Carriage.position",
    [0, 1.5, 3, 3.35, 4],
    [
      CARRIAGE_LINE_START_X,
      0,
      0,
      CARRIAGE_LINE_END_X,
      0,
      0,
      CARRIAGE_LINE_END_X,
      0,
      0,
      CARRIAGE_LINE_START_X,
      0,
      0,
      CARRIAGE_LINE_START_X,
      0,
      0,
    ],
  );
  const paperTrack = new THREE.VectorKeyframeTrack(
    "Paper.position",
    [0, 3, 4],
    [0, 4.08, -1.67, 0, 4.08, -1.67, 0, 4.36, -1.67],
  );
  return new THREE.AnimationClip("TypingLoop", 4, [carriageTrack, paperTrack]);
}

async function downloadGlb(): Promise<void> {
  setStatus("EXPORTING");
  const exportModel = model.clone(true);
  exportModel.rotation.set(0, 0, 0);
  exportModel.position.set(0, 0, 0);
  exportModel.scale.set(1, 1, 1);
  exportModel.traverse((object) => {
    const part = object as Explodable;
    const base = part.userData.basePosition;
    if (base) object.position.fromArray(base);
  });

  try {
    const { GLTFExporter } = await import(
      "three/examples/jsm/exporters/GLTFExporter.js"
    );
    const exporter = new GLTFExporter();
    const output = await new Promise<ArrayBuffer>((resolve, reject) => {
      exporter.parse(
        exportModel,
        (result) => {
          if (result instanceof ArrayBuffer) resolve(result);
          else reject(new Error("Expected binary GLB output"));
        },
        reject,
        {
          binary: true,
          trs: true,
          onlyVisible: true,
          animations: [createExportAnimation()],
        },
      );
    });

    const blob = new Blob([output], { type: "model/gltf-binary" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "brick-typewriter.glb";
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus("DOWNLOADED");
  } catch (error) {
    console.error(error);
    setStatus("EXPORT ERROR");
  }
}

function toggleReference(force?: boolean): void {
  if (!reference || !referenceButton) return;
  const open = force ?? !reference.classList.contains("is-open");
  reference.classList.toggle("is-open", open);
  reference.setAttribute("aria-hidden", String(!open));
  referenceButton.setAttribute("aria-pressed", String(open));
}

function handleAction(event: Event): void {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-action]");
  if (!button) return;
  const action = button.dataset.action;

  if (action === "print") startPrint();
  if (action === "explode") {
    explodeTarget = explodeTarget > 0.5 ? 0 : 1;
    button.setAttribute("aria-pressed", String(explodeTarget === 1));
    setStatus(explodeTarget === 1 ? "EXPLODED" : "ASSEMBLING");
  }
  if (action === "rotate") {
    controls.autoRotate = !controls.autoRotate;
    button.setAttribute("aria-pressed", String(controls.autoRotate));
    setStatus(controls.autoRotate ? "ORBITING" : "READY");
  }
  if (action === "reset") resetView();
  if (action === "reference") toggleReference();
  if (action === "download") void downloadGlb();
}

function isPhoneEmbedded(): boolean {
  try {
    return window.parent !== window && window.parent.matchMedia("(max-width: 768px)").matches;
  } catch {
    return false;
  }
}

function fitPhoneEmbeddedModel(aspect: number): void {
  model.scale.setScalar(1);
  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model);
  const center = bounds.getCenter(new THREE.Vector3());
  const direction = new THREE.Vector3(10.6, 7.2, 12.4).normalize();
  camera.fov = 36;
  camera.position.copy(center).add(direction);
  camera.lookAt(center);
  const inverseRotation = camera.quaternion.clone().invert();
  const tangent = Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));
  let distance = 7.5;
  // Frame the actual model bounds instead of shrinking the whole model on tall screens.
  for (const x of [bounds.min.x, bounds.max.x]) {
    for (const y of [bounds.min.y, bounds.max.y]) {
      for (const z of [bounds.min.z, bounds.max.z]) {
        const corner = new THREE.Vector3(x, y, z).sub(center).applyQuaternion(inverseRotation);
        distance = Math.max(distance, corner.z + Math.abs(corner.x) / (tangent * aspect * 0.91), corner.z + Math.abs(corner.y) / (tangent * 0.7));
      }
    }
  }
  controls.target.copy(center);
  controls.maxDistance = Math.max(30, distance * 1.6);
  camera.position.copy(center).addScaledVector(direction, distance);
  if (scene.fog instanceof THREE.Fog) {
    scene.fog.near = distance + 6;
    scene.fog.far = distance + 28;
  }
}

function resize(): void {
  const width = appElement.clientWidth;
  const height = appElement.clientHeight;
  const aspect = width / Math.max(height, 1);
  renderer.setSize(width, height, false);
  camera.aspect = aspect;
  if (!isPhoneEmbedded() && scene.fog instanceof THREE.Fog) {
    scene.fog.near = 18;
    scene.fog.far = 34;
  }

  if (isPhoneEmbedded()) {
    fitPhoneEmbeddedModel(aspect);
  } else if (aspect < 0.85) {
    camera.fov = 40;
    controls.maxDistance = 30;
    camera.position.set(7, 9, 19);
    controls.target.set(0, 1.6, 0);
    model.scale.setScalar(0.52);
  } else if (aspect < 1.35) {
    camera.fov = 34;
    controls.maxDistance = 32;
    camera.position.set(12.4, 9.5, 15.2);
    controls.target.set(0, 1.55, 0);
    model.scale.setScalar(1);
  } else {
    camera.fov = 29;
    controls.maxDistance = 22;
    camera.position.copy(cameraHome);
    controls.target.set(0, 1.55, 0);
    model.scale.setScalar(1);
  }
  camera.updateProjectionMatrix();
}

function animate(): void {
  if (destroyed) return;
  const currentFrameTime = performance.now();
  const delta = Math.min((currentFrameTime - previousFrameTime) / 1000, 0.05);
  previousFrameTime = currentFrameTime;
  updateInput(delta);
  updateCarriage(delta);
  updateExplosion(delta);
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

actionButtons.forEach((button) => button.addEventListener("click", handleAction));
document
  .querySelector<HTMLElement>("[data-reference-close]")
  ?.addEventListener("click", () => toggleReference(false));
window.addEventListener("resize", resize);
window.addEventListener("keydown", handleKeyboardInput);

resize();
controls.update();
renderer.compileAsync(scene, camera).finally(() => {
  loading?.classList.add("is-hidden");
  setStatus("READY");
});
animate();

window.__brickTypewriter = {
  destroy: () => {
    destroyed = true;
    actionButtons.forEach((button) => button.removeEventListener("click", handleAction));
    window.removeEventListener("resize", resize);
    window.removeEventListener("keydown", handleKeyboardInput);
    resetLivePose();
    controls.dispose();
    renderer.dispose();
    paperTexture.dispose();
    absBumpTexture.dispose();
    scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
      }
    });
  },
};
