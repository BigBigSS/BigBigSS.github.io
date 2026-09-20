import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

type Explodable = THREE.Object3D & {
  userData: {
    basePosition?: [number, number, number];
    explodeVector?: [number, number, number];
  };
};

type CashCommand =
  | "0"
  | "00"
  | "1"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "."
  | "CLEAR"
  | "BACKSPACE"
  | "ADD"
  | "TOTAL"
  | "DRAWER"
  | "TEAR";

type Interaction =
  | { kind: "key"; command: CashCommand }
  | { kind: "crank" }
  | { kind: "drawer" }
  | { kind: "receipt" };

type KeyMechanism = {
  group: THREE.Group;
  lever: THREE.Group;
  selector: THREE.Group;
  command: CashCommand;
  pulse: number;
};

type CashRegisterSnapshot = {
  phase: string;
  entry: string;
  itemCount: number;
  totalCents: number;
  displayCents: number;
  cycleProgress: number;
  drawerProgress: number;
  drawerOpen: boolean;
  receiptProgress: number;
  receiptCount: number;
  crankAngle: number;
  gearAngles: number[];
  keyBailTravel: number;
  totalClutchEngagement: number;
  bellCamAngle: number;
  bellCharge: number;
  bellStrike: number;
  bellStrikerAngle: number;
  bellDomeVibration: number;
  latchAngle: number;
  exploded: boolean;
  soundEnabled: boolean;
};

type CashRegisterRuntime = {
  destroy: () => void;
  command: (command: CashCommand) => void;
  snapshot: () => CashRegisterSnapshot;
};

declare global {
  interface Window {
    __mechanicalCashRegister?: CashRegisterRuntime;
  }
}

const app = document.querySelector<HTMLElement>("[data-cash-register-app]");
const canvas = document.querySelector<HTMLCanvasElement>("[data-canvas]");

if (!app || !canvas) {
  throw new Error("Mechanical cash register mount point is missing");
}

const appElement = app;
const canvasElement = canvas;

window.__mechanicalCashRegister?.destroy();

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xd8dcd8);
scene.fog = new THREE.Fog(0xd8dcd8, 19, 36);

const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 90);
const cameraHome = new THREE.Vector3(11.8, 8.5, 15.2);
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
renderer.toneMappingExposure = 1.02;

const controls = new OrbitControls(camera, canvasElement);
controls.enableDamping = true;
controls.dampingFactor = 0.075;
controls.target.set(0, 2.05, 0.15);
controls.minDistance = 8;
controls.maxDistance = 24;
controls.maxPolarAngle = Math.PI * 0.495;
controls.autoRotateSpeed = 0.72;

const reducedMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)",
).matches;
const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
const textures: THREE.Texture[] = [];
const disposableMaterials = new Set<THREE.Material>();
const partMeshes: THREE.Mesh[] = [];
const explodables: Explodable[] = [];
const interactiveMeshes: THREE.Object3D[] = [];

function trackTexture<T extends THREE.Texture>(texture: T): T {
  textures.push(texture);
  return texture;
}

function trackMaterial<T extends THREE.Material>(material: T): T {
  disposableMaterials.add(material);
  return material;
}

function createEnamelBumpTexture(): THREE.CanvasTexture {
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = 128;
  textureCanvas.height = 128;
  const context = textureCanvas.getContext("2d");
  if (!context) throw new Error("Enamel texture context is unavailable");

  const image = context.createImageData(
    textureCanvas.width,
    textureCanvas.height,
  );
  let seed = 1948;
  for (let index = 0; index < image.data.length; index += 4) {
    seed = (seed * 48271) % 2147483647;
    const grain = 120 + Math.floor((seed / 2147483647) * 16);
    image.data[index] = grain;
    image.data[index + 1] = grain;
    image.data[index + 2] = grain;
    image.data[index + 3] = 255;
  }
  context.putImageData(image, 0, 0);

  const texture = trackTexture(new THREE.CanvasTexture(textureCanvas));
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(5, 5);
  texture.anisotropy = maxAnisotropy;
  return texture;
}

function createLabelTexture(
  text: string,
  options: {
    size?: number;
    foreground?: string;
    background?: string;
    width?: number;
    height?: number;
  } = {},
): THREE.CanvasTexture {
  const labelCanvas = document.createElement("canvas");
  labelCanvas.width = options.width ?? 256;
  labelCanvas.height = options.height ?? 256;
  const context = labelCanvas.getContext("2d");
  if (!context) throw new Error("Label texture context is unavailable");

  context.fillStyle = options.background ?? "#171412";
  context.fillRect(0, 0, labelCanvas.width, labelCanvas.height);
  context.fillStyle = options.foreground ?? "#ece5d4";
  context.font = `700 ${options.size ?? 138}px "Arial", sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, labelCanvas.width / 2, labelCanvas.height / 2 + 3);

  const texture = trackTexture(new THREE.CanvasTexture(labelCanvas));
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAnisotropy;
  return texture;
}

const enamelBumpTexture = createEnamelBumpTexture();

const materials = {
  enamel: trackMaterial(
    new THREE.MeshPhysicalMaterial({
      color: 0x741d21,
      roughness: 0.3,
      metalness: 0.22,
      clearcoat: 0.62,
      clearcoatRoughness: 0.25,
      bumpMap: enamelBumpTexture,
      bumpScale: 0.025,
    }),
  ),
  enamelDark: trackMaterial(
    new THREE.MeshStandardMaterial({
      color: 0x421417,
      roughness: 0.4,
      metalness: 0.28,
      bumpMap: enamelBumpTexture,
      bumpScale: 0.018,
    }),
  ),
  bakelite: trackMaterial(
    new THREE.MeshPhysicalMaterial({
      color: 0x171412,
      roughness: 0.28,
      clearcoat: 0.32,
      clearcoatRoughness: 0.3,
    }),
  ),
  iron: trackMaterial(
    new THREE.MeshStandardMaterial({
      color: 0x262724,
      roughness: 0.62,
      metalness: 0.62,
    }),
  ),
  brass: trackMaterial(
    new THREE.MeshStandardMaterial({
      color: 0xb68b45,
      roughness: 0.28,
      metalness: 0.88,
    }),
  ),
  brassDark: trackMaterial(
    new THREE.MeshStandardMaterial({
      color: 0x735427,
      roughness: 0.38,
      metalness: 0.82,
    }),
  ),
  nickel: trackMaterial(
    new THREE.MeshStandardMaterial({
      color: 0xb8bdbc,
      roughness: 0.2,
      metalness: 0.92,
    }),
  ),
  ivory: trackMaterial(
    new THREE.MeshStandardMaterial({
      color: 0xe9e1cf,
      roughness: 0.74,
    }),
  ),
  wood: trackMaterial(
    new THREE.MeshStandardMaterial({
      color: 0x4c3025,
      roughness: 0.65,
    }),
  ),
  glass: trackMaterial(
    new THREE.MeshPhysicalMaterial({
      color: 0x87948e,
      roughness: 0.12,
      metalness: 0,
      transmission: 0.22,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
    }),
  ),
};

const invisibleHitMaterial = trackMaterial(
  new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false,
    colorWrite: false,
  }),
);

const digitTextures = Array.from({ length: 10 }, (_, digit) =>
  createLabelTexture(String(digit), {
    size: 168,
    foreground: "#ede7d8",
    background: "#11110f",
  }),
);
const digitMaterials = digitTextures.map((texture) =>
  trackMaterial(
    new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.45,
      metalness: 0.08,
    }),
  ),
);
const keyLabelMaterialCache = new Map<string, THREE.MeshStandardMaterial>();

function getKeyLabelMaterial(label: string): THREE.MeshStandardMaterial {
  const cached = keyLabelMaterialCache.get(label);
  if (cached) return cached;

  const texture = createLabelTexture(label, {
    size: label.length > 2 ? 76 : label.length > 1 ? 108 : 144,
    foreground: "#eee6d3",
    background: "#161310",
  });
  const material = trackMaterial(
    new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.38,
    }),
  );
  keyLabelMaterialCache.set(label, material);
  return material;
}

const model = new THREE.Group();
model.name = "MechanicalCashRegister";
model.rotation.y = -0.08;
model.position.y = -0.52;
scene.add(model);

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
  radialSegments = 28,
  axis: "x" | "y" | "z" = "y",
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, length, radialSegments),
    material,
  );
  if (axis === "x") mesh.rotation.z = Math.PI / 2;
  if (axis === "z") mesh.rotation.x = Math.PI / 2;
  return mesh;
}

function rodBetween(
  start: THREE.Vector3,
  end: THREE.Vector3,
  radius: number,
  material: THREE.Material,
  radialSegments = 18,
): THREE.Mesh {
  const rod = cylinder(radius, 1, material, radialSegments);
  const direction = new THREE.Vector3().subVectors(end, start);
  const length = direction.length();
  rod.position.copy(start).add(end).multiplyScalar(0.5);
  rod.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction.normalize(),
  );
  rod.scale.y = length;
  return rod;
}

function coilSpring(
  radius: number,
  length: number,
  turns: number,
  material: THREE.Material,
): THREE.Mesh {
  const points: THREE.Vector3[] = [];
  const segments = turns * 16;
  for (let index = 0; index <= segments; index += 1) {
    const progress = index / segments;
    const angle = progress * turns * Math.PI * 2;
    points.push(
      new THREE.Vector3(
        Math.cos(angle) * radius,
        progress * length,
        Math.sin(angle) * radius,
      ),
    );
  }
  return new THREE.Mesh(
    new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(points),
      segments,
      0.012,
      6,
      false,
    ),
    material,
  );
}

function setInteraction(
  object: THREE.Object3D,
  interaction: Interaction,
): void {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.userData.interaction = interaction;
      if (child.material === invisibleHitMaterial) {
        child.userData.skipShadow = true;
      }
      interactiveMeshes.push(child);
    }
  });
}

function createGearGeometry(
  teeth: number,
  rootRadius: number,
  tipRadius: number,
  thickness: number,
): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  const steps = teeth * 4;
  for (let index = 0; index < steps; index += 1) {
    const angle = (index / steps) * Math.PI * 2;
    const toothPhase = index % 4;
    const radius =
      toothPhase === 1 || toothPhase === 2 ? tipRadius : rootRadius;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (index === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.025,
    bevelThickness: 0.025,
    curveSegments: 1,
  });
  geometry.translate(0, 0, -thickness / 2);
  return geometry;
}

function createGear(
  teeth: number,
  rootRadius: number,
  tipRadius: number,
  thickness: number,
  material: THREE.Material,
  hubRadius = rootRadius * 0.28,
): THREE.Group {
  const gear = new THREE.Group();
  const toothed = new THREE.Mesh(
    createGearGeometry(teeth, rootRadius, tipRadius, thickness),
    material,
  );
  toothed.rotation.y = Math.PI / 2;
  const hub = cylinder(hubRadius, thickness + 0.18, materials.iron, 28, "x");
  const axle = cylinder(
    hubRadius * 0.34,
    thickness + 0.42,
    materials.nickel,
    20,
    "x",
  );
  gear.add(toothed, hub, axle);
  return gear;
}

const keyMechanisms: KeyMechanism[] = [];
const keyByCommand = new Map<CashCommand, KeyMechanism>();
const digitDrums: THREE.Group[] = [];
const digitDrumAngles = Array.from({ length: 8 }, () => 0);
const digitDrumTargets = Array.from({ length: 8 }, () => 0);
const gearGroups: THREE.Group[] = [];

let drawerGroup = new THREE.Group();
let crankPivot = new THREE.Group();
let receiptRoll = new THREE.Group();
let receiptFeedUpper = new THREE.Mesh();
let receiptFeedLower = new THREE.Mesh();
let receiptMesh: THREE.Mesh | null = null;
let receiptMaterial: THREE.MeshStandardMaterial | null = null;
let receiptTexture: THREE.CanvasTexture | null = null;
let receiptCanvas: HTMLCanvasElement | null = null;
let receiptContext: CanvasRenderingContext2D | null = null;
let keyboardBail: THREE.Group | null = null;
let addControlLink: THREE.Group | null = null;
let addPawlPivot: THREE.Group | null = null;
let totalControlLink: THREE.Group | null = null;
let totalClutchSleeve: THREE.Group | null = null;
let bellDome: THREE.Mesh | null = null;
let strikerPivot: THREE.Group | null = null;
let bellCam: THREE.Group | null = null;
let bellFollower: THREE.Group | null = null;
let bellPullRod: THREE.Group | null = null;
let bellSpring: THREE.Mesh | null = null;
let latchBolt = new THREE.Group();

const drawerTravel = 3.05;
const receiptHeight = 3.2;
const receiptAnchor = new THREE.Vector3(2.82, 3.2, 0.88);
const receiptTilt = -1.08;
const gearPhaseOffsets = [1.063, -2.159, 2.249, -1.826] as const;
const bellStrikerRestAngle = 0.32;

function buildBaseAndHousing(): void {
  const base = new THREE.Group();
  base.position.set(0, 0.46, 0.1);

  const cavityFloor = roundedMesh([7.9, 0.2, 5.65], materials.enamel, 0.08, 3);
  cavityFloor.position.y = -0.27;
  base.add(cavityFloor);

  for (const x of [-4.125, 4.125]) {
    const sideRail = roundedMesh([0.55, 0.82, 6.15], materials.enamel, 0.2, 4);
    sideRail.position.set(x, 0.03, 0);
    base.add(sideRail);
  }

  const rearRail = roundedMesh([7.7, 0.82, 0.45], materials.enamel, 0.16, 4);
  rearRail.position.set(0, 0.03, -2.85);
  base.add(rearRail);

  const lowerBand = roundedMesh(
    [8.35, 0.24, 5.92],
    materials.enamelDark,
    0.1,
    3,
  );
  lowerBand.position.y = -0.55;
  base.add(lowerBand);

  const frontRail = roundedMesh(
    [7.7, 0.32, 0.28],
    materials.enamelDark,
    0.08,
    3,
  );
  frontRail.position.set(0, -0.12, 2.62);
  base.add(frontRail);

  for (const x of [-3.55, 3.55]) {
    const foot = roundedMesh([0.72, 0.24, 0.82], materials.bakelite, 0.08, 2);
    foot.position.set(x, -0.7, 2.35);
    base.add(foot);
  }

  model.add(registerPart(base, "BaseAssembly", new THREE.Vector3(0, -1.3, 0)));

  const upper = new THREE.Group();
  upper.position.set(0, 3.48, -1.42);
  for (const x of [-3.4625, 3.4625]) {
    const upright = roundedMesh([0.625, 2.25, 2.18], materials.enamel, 0.28, 5);
    upright.position.x = x;
    upper.add(upright);
  }

  const upperRail = roundedMesh([6.3, 0.385, 2.18], materials.enamel, 0.18, 4);
  upperRail.position.y = 0.9325;
  upper.add(upperRail);

  const lowerFascia = roundedMesh(
    [6.3, 0.805, 2.18],
    materials.enamel,
    0.22,
    4,
  );
  lowerFascia.position.y = -0.7225;
  upper.add(lowerFascia);

  const rearPanel = roundedMesh(
    [6.45, 1.1, 0.42],
    materials.enamelDark,
    0.14,
    4,
  );
  rearPanel.position.set(0, 0.24, -0.86);
  upper.add(rearPanel);

  const crown = roundedMesh([7.0, 0.34, 1.85], materials.enamelDark, 0.15, 3);
  crown.position.y = 1.08;
  upper.add(crown);

  for (const x of [-3.13, 3.13]) {
    const windowSide = roundedMesh(
      [0.18, 1.12, 0.24],
      materials.bakelite,
      0.055,
      3,
    );
    windowSide.position.set(x, 0.24, 1.1);
    upper.add(windowSide);
  }

  for (const y of [-0.25, 0.73]) {
    const windowRail = roundedMesh(
      [6.44, 0.14, 0.24],
      materials.bakelite,
      0.05,
      3,
    );
    windowRail.position.set(0, y, 1.1);
    upper.add(windowRail);
  }

  const glass = roundedMesh([6.02, 0.82, 0.045], materials.glass, 0.035, 2);
  glass.position.set(0, 0.24, 1.25);
  glass.castShadow = false;
  upper.add(glass);

  model.add(
    registerPart(upper, "DisplayHousing", new THREE.Vector3(0, 1.85, -0.9)),
  );

  for (const x of [-3.62, 3.62]) {
    const sideCheek = new THREE.Group();
    sideCheek.position.set(0, 1.75, -0.2);
    const cheek = roundedMesh([0.78, 2.35, 4.65], materials.enamel, 0.24, 5);
    cheek.position.x = x;
    cheek.rotation.x = 0.08;
    sideCheek.add(cheek);
    model.add(
      registerPart(
        sideCheek,
        x < 0 ? "LeftSideHousing" : "RightSideHousing",
        new THREE.Vector3(Math.sign(x) * 1.55, 0.45, -0.55),
      ),
    );
  }
}

function buildKeyboard(): void {
  const keyboard = new THREE.Group();
  keyboard.position.set(0, 1.65, 0.92);
  keyboard.rotation.x = 0.19;

  const deck = roundedMesh([6.08, 0.3, 3.4], materials.iron, 0.16, 4);
  deck.position.y = -0.07;
  keyboard.add(deck);

  const trim = roundedMesh([6.28, 0.16, 3.58], materials.enamel, 0.18, 4);
  trim.position.y = -0.305;
  keyboard.add(trim);

  const numericRows: CashCommand[][] = [
    ["7", "8", "9"],
    ["4", "5", "6"],
    ["1", "2", "3"],
    ["00", "0", "."],
  ];
  const rowZ = [-1.04, -0.34, 0.36, 1.06];
  const columnX = [-1.72, -0.72, 0.28];

  for (const z of rowZ) {
    const rowShaft = cylinder(0.05, 2.64, materials.nickel, 18, "x");
    rowShaft.position.set(-0.72, -0.46, z - 0.24);
    keyboard.add(rowShaft);

    for (const x of [-2.08, 0.64]) {
      const bearing = roundedMesh(
        [0.16, 0.2, 0.18],
        materials.brassDark,
        0.035,
        2,
      );
      bearing.position.set(x, -0.46, z - 0.24);
      keyboard.add(bearing);
    }
  }

  const bail = new THREE.Group();
  bail.position.y = -0.61;
  bail.userData.restY = bail.position.y;
  for (const z of rowZ) {
    const crossbar = cylinder(0.035, 2.58, materials.brassDark, 16, "x");
    crossbar.position.set(-0.72, 0, z + 0.06);
    bail.add(crossbar);
  }
  for (const x of [-2.01, 0.57]) {
    const sideRail = cylinder(0.035, 2.8, materials.brassDark, 16, "z");
    sideRail.position.set(x, 0, 0.01);
    bail.add(sideRail);
  }
  keyboard.add(bail);
  keyboardBail = bail;

  function addRoundKey(command: CashCommand, x: number, z: number): void {
    const key = new THREE.Group();
    key.position.set(x, 0.12, z);
    key.userData.restY = key.position.y;

    const stem = cylinder(0.13, 0.3, materials.iron, 18);
    stem.position.y = 0.05;
    const collar = cylinder(0.31, 0.12, materials.brassDark, 28);
    collar.position.y = 0.22;
    const cap = cylinder(0.26, 0.16, materials.bakelite, 32);
    cap.position.y = 0.32;
    const plunger = cylinder(0.055, 0.5, materials.nickel, 16);
    plunger.position.y = -0.28;
    key.add(stem, collar, cap, plunger);

    const label = new THREE.Mesh(
      new THREE.PlaneGeometry(0.34, 0.34),
      getKeyLabelMaterial(command),
    );
    label.rotation.x = -Math.PI / 2;
    label.position.y = 0.405;
    label.castShadow = false;
    label.userData.skipShadow = true;
    key.add(label);

    const hit = cylinder(0.37, 0.5, invisibleHitMaterial, 16);
    hit.position.y = 0.25;
    key.add(hit);
    setInteraction(hit, { kind: "key", command });

    const lever = new THREE.Group();
    lever.position.set(x, -0.46, z - 0.24);
    lever.userData.restRotationX = 0;
    const leverArm = roundedMesh(
      [0.1, 0.1, 0.78],
      materials.brassDark,
      0.03,
      2,
    );
    leverArm.position.z = 0.3;
    lever.add(leverArm);
    keyboard.add(lever);

    const selector = new THREE.Group();
    selector.position.set(x, -0.66, z + 0.15);
    selector.userData.restY = selector.position.y;
    const selectorBlade = roundedMesh(
      [0.1, 0.3, 0.18],
      materials.nickel,
      0.025,
      2,
    );
    const selectorStop = roundedMesh(
      [0.18, 0.055, 0.25],
      materials.brassDark,
      0.02,
      2,
    );
    selectorStop.position.y = -0.12;
    selector.add(selectorBlade, selectorStop);
    keyboard.add(selector);

    keyboard.add(key);
    const mechanism: KeyMechanism = {
      group: key,
      lever,
      selector,
      command,
      pulse: -1,
    };
    keyMechanisms.push(mechanism);
    keyByCommand.set(command, mechanism);
  }

  numericRows.forEach((row, rowIndex) => {
    row.forEach((command, columnIndex) => {
      addRoundKey(command, columnX[columnIndex], rowZ[rowIndex]);
    });
  });

  const functionKeys: Array<{
    command: CashCommand;
    label: string;
    z: number;
    color: THREE.Material;
    height: number;
  }> = [
    {
      command: "CLEAR",
      label: "C",
      z: -0.86,
      color: materials.enamelDark,
      height: 0.54,
    },
    {
      command: "ADD",
      label: "ADD",
      z: 0.0,
      color: materials.brassDark,
      height: 0.62,
    },
    {
      command: "TOTAL",
      label: "TOTAL",
      z: 0.96,
      color: materials.enamel,
      height: 0.82,
    },
  ];

  functionKeys.forEach(({ command, label, z, color, height }) => {
    const key = new THREE.Group();
    key.position.set(1.3, 0.14, z);
    key.userData.restY = key.position.y;

    const stem = roundedMesh(
      [0.62, 0.26, height * 0.68],
      materials.iron,
      0.08,
      2,
    );
    stem.position.y = 0.02;
    const cap = roundedMesh([1.05, 0.2, height], color, 0.16, 4);
    cap.position.y = 0.24;
    const plunger = roundedMesh([0.11, 0.56, 0.13], materials.nickel, 0.025, 2);
    plunger.position.y = -0.31;
    key.add(stem, cap, plunger);

    const labelMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.72, Math.min(0.34, height * 0.48)),
      getKeyLabelMaterial(label),
    );
    labelMesh.rotation.x = -Math.PI / 2;
    labelMesh.position.y = 0.35;
    labelMesh.castShadow = false;
    labelMesh.userData.skipShadow = true;
    key.add(labelMesh);

    const hit = roundedMesh(
      [1.2, 0.52, height + 0.14],
      invisibleHitMaterial,
      0.12,
      2,
    );
    hit.position.y = 0.2;
    key.add(hit);
    setInteraction(hit, { kind: "key", command });

    const lever = new THREE.Group();
    lever.position.set(1.3, -0.46, z - 0.24);
    lever.userData.restRotationX = 0;
    const leverArm = roundedMesh(
      [0.16, 0.1, height + 0.62],
      materials.brassDark,
      0.035,
      2,
    );
    leverArm.position.z = 0.3;
    lever.add(leverArm);
    keyboard.add(lever);

    const pivotPin = cylinder(0.06, 0.36, materials.nickel, 16, "x");
    pivotPin.position.copy(lever.position);
    keyboard.add(pivotPin);

    const selector = new THREE.Group();
    selector.position.set(1.3, -0.66, z + 0.15);
    selector.userData.restY = selector.position.y;
    const selectorBlade = roundedMesh(
      [0.14, 0.32, 0.24],
      command === "TOTAL" ? materials.brass : materials.nickel,
      0.03,
      2,
    );
    const selectorStop = roundedMesh(
      [0.24, 0.06, 0.32],
      materials.brassDark,
      0.02,
      2,
    );
    selectorStop.position.y = -0.13;
    selector.add(selectorBlade, selectorStop);
    keyboard.add(selector);

    keyboard.add(key);
    const mechanism: KeyMechanism = {
      group: key,
      lever,
      selector,
      command,
      pulse: -1,
    };
    keyMechanisms.push(mechanism);
    keyByCommand.set(command, mechanism);
  });

  model.add(
    registerPart(keyboard, "KeyboardAssembly", new THREE.Vector3(0, 0.45, 2.3)),
  );
}

function buildDigitDisplay(): void {
  const drums = new THREE.Group();
  drums.position.set(0, 3.72, -0.58);
  const tileGeometry = new THREE.PlaneGeometry(0.46, 0.25);
  const radius = 0.352;
  const step = (Math.PI * 2) / 10;

  for (let drumIndex = 0; drumIndex < 8; drumIndex += 1) {
    const mount = new THREE.Group();
    const drum = new THREE.Group();
    const x = -2.55 + drumIndex * 0.69 + (drumIndex >= 6 ? 0.22 : 0);
    mount.position.x = x;
    drum.name = `DigitDrum_${drumIndex}`;

    const core = cylinder(0.33, 0.48, materials.iron, 28, "x");
    drum.add(core);

    for (let digit = 0; digit < 10; digit += 1) {
      const angle = digit * step;
      const numberFace = new THREE.Mesh(tileGeometry, digitMaterials[digit]);
      numberFace.position.set(
        0,
        Math.sin(angle) * (radius + 0.016),
        Math.cos(angle) * (radius + 0.016),
      );
      numberFace.rotation.x = -angle;
      numberFace.castShadow = false;
      numberFace.receiveShadow = false;
      numberFace.userData.skipShadow = true;
      drum.add(numberFace);
    }

    mount.add(drum);
    drums.add(mount);
    digitDrums.push(drum);
  }

  const decimalPlate = cylinder(0.08, 0.08, materials.ivory, 20, "z");
  decimalPlate.position.set(1.46, -0.2, 0.375);
  drums.add(decimalPlate);

  model.add(registerPart(drums, "AmountDrums", new THREE.Vector3(0, 1.1, 1.3)));
}

function buildBell(): void {
  const assembly = new THREE.Group();

  const mountingPlate = roundedMesh(
    [0.1, 0.72, 0.75],
    materials.iron,
    0.035,
    2,
  );
  mountingPlate.position.set(-3.17, 2, -0.08);
  const shelf = roundedMesh([1.02, 0.1, 0.75], materials.iron, 0.035, 2);
  shelf.position.set(-2.69, 2.12, -0.08);
  assembly.add(mountingPlate, shelf);

  for (const y of [1.76, 2.24]) {
    for (const z of [-0.28, 0.12]) {
      const bolt = cylinder(0.045, 0.14, materials.nickel, 16, "x");
      bolt.position.set(-3.1, y, z);
      assembly.add(bolt);
    }
  }

  const bell = new THREE.Group();
  bell.position.set(-2.58, 2.3, -0.08);
  const mountingPost = cylinder(0.07, 0.22, materials.brassDark, 24);
  mountingPost.position.y = -0.08;
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(0.42, 42, 20, 0, Math.PI * 2, 0, Math.PI * 0.52),
    materials.brass,
  );
  dome.scale.y = 0.58;
  dome.position.y = 0.06;
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(0.405, 0.025, 10, 42),
    materials.brassDark,
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.04;
  const retainingNut = cylinder(0.055, 0.09, materials.brassDark, 20);
  retainingNut.position.y = 0.34;
  bell.add(mountingPost, dome, rim, retainingNut);
  assembly.add(bell);
  bellDome = dome;

  const striker = new THREE.Group();
  striker.position.set(-3.05, 1.84, -0.06);
  striker.userData.restRotationZ = bellStrikerRestAngle;
  striker.rotation.z = bellStrikerRestAngle;
  const arm = roundedMesh([0.065, 0.5, 0.065], materials.nickel, 0.02, 2);
  arm.position.y = 0.25;
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 20, 14),
    materials.brassDark,
  );
  head.position.y = 0.5;
  const tail = roundedMesh([0.055, 0.22, 0.055], materials.nickel, 0.018, 2);
  tail.position.y = -0.11;
  striker.add(arm, head, tail);
  assembly.add(striker);
  strikerPivot = striker;

  const pivotCollar = cylinder(0.13, 0.08, materials.brassDark, 24, "z");
  pivotCollar.position.copy(striker.position);
  const pivotPin = cylinder(0.075, 0.2, materials.nickel, 20, "z");
  pivotPin.position.copy(striker.position);
  assembly.add(pivotCollar, pivotPin);

  const spring = coilSpring(0.04, 0.23, 5, materials.nickel);
  spring.position.set(-3.15, 1.59, -0.06);
  spring.userData.restScaleY = 1;
  assembly.add(spring);
  bellSpring = spring;

  model.add(
    registerPart(assembly, "BellAssembly", new THREE.Vector3(-1.35, 0.9, -0.2)),
  );
}

function buildDrawer(): void {
  const drawer = new THREE.Group();
  drawer.position.set(0, 0.58, 1.45);

  const tray = roundedMesh([6.12, 0.52, 2.8], materials.wood, 0.11, 3);
  tray.position.y = -0.01;
  drawer.add(tray);

  const trayFloor = roundedMesh([5.88, 0.1, 2.56], materials.bakelite, 0.04, 2);
  trayFloor.position.y = 0.23;
  drawer.add(trayFloor);

  const front = roundedMesh([7.5, 0.88, 0.26], materials.enamel, 0.12, 3);
  front.position.set(0, 0.02, 1.58);
  drawer.add(front);

  for (let divider = -2; divider <= 2; divider += 1) {
    const rail = roundedMesh([0.07, 0.18, 2.2], materials.brassDark, 0.025, 2);
    rail.position.set(divider * 1.05, 0.28, 0.02);
    drawer.add(rail);
  }

  const coinGeometry = new THREE.CylinderGeometry(0.26, 0.26, 0.045, 24);
  for (let column = 0; column < 6; column += 1) {
    for (let coin = 0; coin < 5; coin += 1) {
      const material = column % 3 === 0 ? materials.brass : materials.nickel;
      const piece = new THREE.Mesh(coinGeometry, material);
      piece.position.set(-2.65 + column * 1.06, 0.34 + coin * 0.04, 0.2);
      drawer.add(piece);
    }
  }

  const handle = cylinder(0.22, 0.52, materials.bakelite, 28, "z");
  handle.position.set(0, 0.02, 1.86);
  drawer.add(handle);

  const handleHit = cylinder(0.4, 0.68, invisibleHitMaterial, 16, "z");
  handleHit.position.copy(handle.position);
  drawer.add(handleHit);
  setInteraction(handleHit, { kind: "drawer" });

  const latch = new THREE.Group();
  latch.position.set(0, 0.52, -1.36);
  latch.userData.restRotationX = 0;
  const bolt = roundedMesh([1.05, 0.14, 0.18], materials.nickel, 0.04, 2);
  latch.add(bolt);
  drawer.add(latch);
  latchBolt = latch;

  drawerGroup = drawer;
  model.add(
    registerPart(drawer, "CashDrawer", new THREE.Vector3(0, -0.25, 3.2)),
  );
}

function buildGearTrainAndCrank(): void {
  const assembly = new THREE.Group();
  assembly.position.set(0, 0, 0);

  const backing = roundedMesh([0.28, 4.1, 4.2], materials.enamelDark, 0.12, 3);
  backing.position.set(4.14, 2.35, -0.2);
  assembly.add(backing);

  const gearSpecs = [
    {
      teeth: 16,
      root: 0.55,
      tip: 0.68,
      y: 1.6,
      z: 1.08,
      material: materials.brass,
    },
    {
      teeth: 24,
      root: 0.79,
      tip: 0.93,
      y: 3.0,
      z: 0.54,
      material: materials.iron,
    },
    {
      teeth: 32,
      root: 1.03,
      tip: 1.18,
      y: 1.66,
      z: -0.985,
      material: materials.brass,
    },
    {
      teeth: 18,
      root: 0.61,
      tip: 0.73,
      y: 3.47,
      z: -1.17,
      material: materials.brassDark,
    },
  ] as const;

  gearSpecs.forEach((spec, index) => {
    const gear = createGear(
      spec.teeth,
      spec.root,
      spec.tip,
      0.28,
      spec.material,
    );
    gear.position.set(4.45, spec.y, spec.z);
    gear.name = `DriveGear_${index}`;
    assembly.add(gear);
    gearGroups.push(gear);
  });

  const shaft = cylinder(0.11, 0.65, materials.nickel, 20, "x");
  shaft.position.set(4.15, 1.66, -0.985);
  assembly.add(shaft);

  const crank = new THREE.Group();
  crank.position.set(4.92, 1.6, 1.08);
  crank.name = "CrankPivot";
  const crankHub = cylinder(0.24, 0.38, materials.nickel, 28, "x");
  const crankArm = roundedMesh([0.16, 1.7, 0.16], materials.nickel, 0.06, 3);
  crankArm.position.y = 0.82;
  const handle = cylinder(0.21, 0.82, materials.enamel, 28, "x");
  handle.position.set(0.36, 1.65, 0);
  crank.add(crankHub, crankArm, handle);

  const crankHit = roundedMesh(
    [0.72, 2.2, 0.72],
    invisibleHitMaterial,
    0.16,
    2,
  );
  crankHit.position.y = 0.82;
  crank.add(crankHit);
  setInteraction(crankHit, { kind: "crank" });

  crankPivot = crank;
  assembly.add(crank);

  model.add(
    registerPart(assembly, "GearTrainAssembly", new THREE.Vector3(2.5, 0.6, 0)),
  );
}

function buildControlLinkages(): void {
  const assembly = new THREE.Group();

  const mainShaft = cylinder(0.065, 7, materials.nickel, 24, "x");
  mainShaft.position.set(0.45, 1.25, -0.34);
  assembly.add(mainShaft);

  for (const x of [-3.03, 3.92]) {
    const bearing = roundedMesh([0.18, 0.32, 0.34], materials.iron, 0.04, 2);
    bearing.position.set(x, 1.25, -0.34);
    const bushing = cylinder(0.11, 0.22, materials.brassDark, 20, "x");
    bushing.position.copy(bearing.position);
    assembly.add(bearing, bushing);
  }

  const cam = new THREE.Group();
  cam.position.set(-2.96, 1.25, -0.34);
  cam.userData.phaseOffset = Math.PI * 0.72;
  const camLobe = cylinder(0.21, 0.16, materials.brassDark, 36, "x");
  camLobe.scale.y = 1.28;
  camLobe.position.y = 0.045;
  const camHub = cylinder(0.09, 0.22, materials.nickel, 20, "x");
  cam.add(camLobe, camHub);
  assembly.add(cam);
  bellCam = cam;

  const follower = new THREE.Group();
  follower.position.set(-2.98, 1.51, -0.22);
  follower.userData.restRotationX = 0;
  const followerArm = roundedMesh(
    [0.07, 0.38, 0.07],
    materials.brassDark,
    0.02,
    2,
  );
  followerArm.position.y = -0.16;
  const followerRoller = cylinder(0.085, 0.16, materials.nickel, 20, "x");
  followerRoller.position.y = -0.35;
  follower.add(followerArm, followerRoller);
  assembly.add(follower);
  bellFollower = follower;

  const followerPin = cylinder(0.075, 0.22, materials.nickel, 20, "x");
  followerPin.position.copy(follower.position);
  assembly.add(followerPin);

  const pullRod = new THREE.Group();
  pullRod.userData.restY = 0;
  const pullRodMesh = rodBetween(
    new THREE.Vector3(-2.98, 1.47, -0.2),
    new THREE.Vector3(-2.98, 1.66, -0.07),
    0.035,
    materials.nickel,
  );
  pullRod.add(pullRodMesh);
  for (const point of [
    new THREE.Vector3(-2.98, 1.47, -0.2),
    new THREE.Vector3(-2.98, 1.66, -0.07),
  ]) {
    const joint = new THREE.Mesh(
      new THREE.SphereGeometry(0.055, 16, 10),
      materials.brassDark,
    );
    joint.position.copy(point);
    pullRod.add(joint);
  }
  assembly.add(pullRod);
  bellPullRod = pullRod;

  const totalLink = new THREE.Group();
  totalLink.userData.restY = 0;
  const totalRod = rodBetween(
    new THREE.Vector3(1.3, 1.17, 1.56),
    new THREE.Vector3(1.3, 1.29, -0.25),
    0.045,
    materials.brassDark,
  );
  totalLink.add(totalRod);
  for (const x of [1.12, 1.48]) {
    const forkArm = roundedMesh([0.08, 0.3, 0.08], materials.nickel, 0.02, 2);
    forkArm.position.set(x, 1.38, -0.3);
    totalLink.add(forkArm);
  }
  const forkBridge = roundedMesh([0.44, 0.08, 0.08], materials.nickel, 0.02, 2);
  forkBridge.position.set(1.3, 1.51, -0.3);
  totalLink.add(forkBridge);
  assembly.add(totalLink);
  totalControlLink = totalLink;

  const clutch = new THREE.Group();
  clutch.position.set(1.3, 1.25, -0.34);
  clutch.userData.restX = clutch.position.x;
  const clutchSleeve = cylinder(0.14, 0.34, materials.brass, 28, "x");
  const clutchRingLeft = cylinder(0.17, 0.055, materials.brassDark, 28, "x");
  clutchRingLeft.position.x = -0.17;
  const clutchRingRight = clutchRingLeft.clone();
  clutchRingRight.position.x = 0.17;
  clutch.add(clutchSleeve, clutchRingLeft, clutchRingRight);
  assembly.add(clutch);
  totalClutchSleeve = clutch;

  const addLink = new THREE.Group();
  addLink.userData.restY = 0;
  const addRod = rodBetween(
    new THREE.Vector3(1.3, 1.18, 0.9),
    new THREE.Vector3(3.96, 1.4, 1.01),
    0.045,
    materials.brassDark,
  );
  addLink.add(addRod);
  assembly.add(addLink);
  addControlLink = addLink;

  const pawl = new THREE.Group();
  pawl.position.set(4.02, 1.4, 1.01);
  pawl.userData.restRotationZ = -0.22;
  pawl.rotation.z = -0.22;
  const pawlArm = roundedMesh([0.07, 0.4, 0.09], materials.nickel, 0.025, 2);
  pawlArm.position.y = 0.17;
  const pawlTip = roundedMesh(
    [0.13, 0.12, 0.13],
    materials.brassDark,
    0.025,
    2,
  );
  pawlTip.position.y = 0.39;
  pawl.add(pawlArm, pawlTip);
  assembly.add(pawl);
  addPawlPivot = pawl;

  model.add(
    registerPart(
      assembly,
      "ControlLinkageAssembly",
      new THREE.Vector3(0, -0.75, -0.35),
    ),
  );
}

function buildReceiptSystem(): void {
  const receipt = new THREE.Group();
  receipt.position.set(0, 0, 0);

  const rollGroup = new THREE.Group();
  rollGroup.position.set(3, 4.75, 0.35);
  const axle = cylinder(0.08, 1.12, materials.nickel, 20, "x");
  const roll = cylinder(0.3, 0.88, materials.ivory, 42, "x");
  rollGroup.add(axle, roll);
  receipt.add(rollGroup);
  receiptRoll = rollGroup;

  for (const x of [2.54, 3.46]) {
    const support = roundedMesh(
      [0.08, 1.1, 0.08],
      materials.brassDark,
      0.025,
      2,
    );
    support.position.set(x, 4.2, 0.36);
    support.rotation.x = -0.14;
    receipt.add(support);
  }

  const feedGroup = new THREE.Group();
  feedGroup.position.set(2.78, 3.45, 0.52);
  const upperRoller = cylinder(0.16, 1, materials.bakelite, 28, "x");
  upperRoller.position.y = 0.16;
  const lowerRoller = cylinder(0.14, 1, materials.nickel, 28, "x");
  lowerRoller.position.y = -0.16;
  feedGroup.add(upperRoller, lowerRoller);
  receipt.add(feedGroup);
  receiptFeedUpper = upperRoller;
  receiptFeedLower = lowerRoller;

  const cutter = roundedMesh([0.88, 0.12, 0.18], materials.nickel, 0.035, 2);
  cutter.position.set(2.78, 3.18, 0.78);
  receipt.add(cutter);

  receiptCanvas = document.createElement("canvas");
  receiptCanvas.width = 512;
  receiptCanvas.height = 1536;
  receiptContext = receiptCanvas.getContext("2d");
  if (!receiptContext)
    throw new Error("Receipt texture context is unavailable");
  receiptTexture = trackTexture(new THREE.CanvasTexture(receiptCanvas));
  receiptTexture.colorSpace = THREE.SRGBColorSpace;
  receiptTexture.anisotropy = maxAnisotropy;
  receiptTexture.wrapS = THREE.ClampToEdgeWrapping;
  receiptTexture.wrapT = THREE.ClampToEdgeWrapping;
  receiptMaterial = trackMaterial(
    new THREE.MeshStandardMaterial({
      map: receiptTexture,
      roughness: 0.9,
      side: THREE.DoubleSide,
      transparent: true,
    }),
  );

  const ticketGeometry = new THREE.PlaneGeometry(0.8, receiptHeight);
  ticketGeometry.translate(0, -receiptHeight / 2, 0);
  const ticket = new THREE.Mesh(ticketGeometry, receiptMaterial);
  ticket.position.copy(receiptAnchor);
  ticket.rotation.x = receiptTilt;
  ticket.name = "Receipt";
  ticket.castShadow = true;
  receipt.add(ticket);
  receiptMesh = ticket;
  setInteraction(ticket, { kind: "receipt" });

  model.add(
    registerPart(receipt, "ReceiptAssembly", new THREE.Vector3(1.6, 1.5, 0.7)),
  );
}

buildBaseAndHousing();
buildKeyboard();
buildDigitDisplay();
buildBell();
buildDrawer();
buildGearTrainAndCrank();
buildControlLinkages();
buildReceiptSystem();

model.traverse((object) => {
  if (object instanceof THREE.Mesh) {
    const skipShadow = object.userData.skipShadow === true;
    object.castShadow = !skipShadow;
    object.receiveShadow = !skipShadow;
  }
});

const floorMaterial = trackMaterial(
  new THREE.ShadowMaterial({ color: 0x303832, opacity: 0.17 }),
);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(70, 70), floorMaterial);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.54;
floor.receiveShadow = true;
scene.add(floor);

const hemisphere = new THREE.HemisphereLight(0xf9fff9, 0xa19b90, 2.05);
scene.add(hemisphere);

const keyLight = new THREE.DirectionalLight(0xfff5e5, 4.35);
keyLight.position.set(-6, 11, 9);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.near = 1;
keyLight.shadow.camera.far = 34;
keyLight.shadow.camera.left = -10;
keyLight.shadow.camera.right = 10;
keyLight.shadow.camera.top = 10;
keyLight.shadow.camera.bottom = -10;
keyLight.shadow.bias = -0.0003;
scene.add(keyLight);

const rimLight = new THREE.DirectionalLight(0xd4a45e, 2.45);
rimLight.position.set(8, 6, -9);
scene.add(rimLight);

const fillLight = new THREE.DirectionalLight(0xaec8c8, 1.45);
fillLight.position.set(6, 4, 9);
scene.add(fillLight);

const receiptHeader = "MECHANICAL REGISTER";
const maxCents = 99_999_999;
const maxItems = 12;
const digitStep = (Math.PI * 2) / 10;

let entry = "";
let items: number[] = [];
let displayCents = 0;
let phase = "idle";
let receiptCount = 0;
let receiptReady = false;
let receiptProgress = 0.08;
let receiptTarget = 0.08;
let receiptTearActive = false;
let receiptTearTime = 0;
let driveAngle = 0;
let driveAngleTarget = 0;
let cycleActive = false;
let cycleAuto = false;
let cycleProgress = 0;
let cycleStartAngle = 0;
let cycleStartReceipt = 0.08;
let cycleBellPlayed = false;
let cycleDrawerPlayed = false;
let lastRatchetTooth = -1;
let drawerProgress = 0;
let drawerTarget = 0;
let explodeTarget = 0;
let explodeAmount = 0;
let soundEnabled = true;
let destroyed = false;
let pageVisible = document.visibilityState !== "hidden";
let previousFrameTime = performance.now();
let animationFrameId = 0;
let demoElapsed = -1;
let demoIndex = 0;
let keyBailTravel = 0;
let totalClutchEngagement = 0;
let bellChargeAmount = 0;
let bellStrikeAmount = 0;
let bellDomeVibration = 0;

const demoSequence: Array<{ at: number; command: CashCommand }> = [
  { at: 0.35, command: "1" },
  { at: 0.58, command: "2" },
  { at: 0.81, command: "." },
  { at: 1.04, command: "5" },
  { at: 1.27, command: "0" },
  { at: 1.66, command: "ADD" },
  { at: 2.04, command: "2" },
  { at: 2.27, command: "." },
  { at: 2.5, command: "7" },
  { at: 2.73, command: "5" },
  { at: 3.15, command: "TOTAL" },
];

const statusLabel = document.querySelector<HTMLElement>("[data-status]");
const entryAmountLabel = document.querySelector<HTMLElement>(
  "[data-entry-amount]",
);
const itemCountLabel = document.querySelector<HTMLElement>("[data-item-count]");
const machineStateLabel = document.querySelector<HTMLElement>(
  "[data-machine-state]",
);
const partCountLabel = document.querySelector<HTMLElement>("[data-part-count]");
const loading = document.querySelector<HTMLElement>("[data-loading]");
const reference = document.querySelector<HTMLElement>("[data-reference]");
const referenceButton = document.querySelector<HTMLButtonElement>(
  '[data-action="reference"]',
);
const referenceCloseButton = document.querySelector<HTMLButtonElement>(
  "[data-reference-close]",
);
const actionButtons = Array.from(
  document.querySelectorAll<HTMLButtonElement>("[data-action]"),
);
const accessibleCommandButtons = Array.from(
  document.querySelectorAll<HTMLButtonElement>("[data-cash-command]"),
);

if (partCountLabel) {
  partCountLabel.textContent = String(partMeshes.length).padStart(3, "0");
}

let audioContext: AudioContext | null = null;

function ensureAudio(): AudioContext | null {
  if (!soundEnabled) return null;
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  if (audioContext.state === "suspended") {
    void audioContext.resume();
  }
  return audioContext;
}

function playTone(
  frequency: number,
  duration: number,
  volume: number,
  type: OscillatorType = "sine",
  delay = 0,
): void {
  const context = ensureAudio();
  if (!context) return;
  const start = context.currentTime + delay;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(Math.max(volume, 0.0001), start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

function playKeyClick(): void {
  playTone(145, 0.055, 0.038, "square");
  playTone(82, 0.04, 0.018, "triangle", 0.012);
}

function playRatchet(): void {
  playTone(760, 0.025, 0.014, "square");
}

function playBell(): void {
  playTone(932, 0.62, 0.065, "sine");
  playTone(1398, 0.48, 0.032, "sine", 0.008);
}

function playDrawerThump(): void {
  playTone(74, 0.19, 0.055, "triangle");
  playTone(118, 0.11, 0.026, "square", 0.015);
}

function formatCents(cents: number): string {
  const safe = Math.max(0, Math.min(Math.round(cents), maxCents));
  return `\u00a5${(safe / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function entryToCents(value = entry): number {
  if (!value || value === ".") return 0;
  const [wholeRaw = "0", fractionRaw = ""] = value.split(".");
  const whole = Number.parseInt(wholeRaw || "0", 10);
  const fraction = Number.parseInt(`${fractionRaw}00`.slice(0, 2), 10);
  if (!Number.isFinite(whole) || !Number.isFinite(fraction)) return 0;
  return Math.min(whole * 100 + fraction, maxCents);
}

function runningTotal(): number {
  return items.reduce((sum, item) => sum + item, 0);
}

function setStatus(value: string): void {
  if (statusLabel) statusLabel.textContent = value;
}

function syncState(): void {
  const effectiveAmount = entry ? entryToCents() : runningTotal();
  if (entryAmountLabel)
    entryAmountLabel.textContent = formatCents(effectiveAmount);
  if (itemCountLabel)
    itemCountLabel.textContent = String(items.length).padStart(2, "0");
  if (machineStateLabel) {
    machineStateLabel.textContent =
      drawerProgress > 0.5
        ? "OPEN"
        : cycleActive
          ? "CYCLE"
          : explodeAmount > 0.5
            ? "VIEW"
            : receiptReady
              ? "DONE"
              : "SALE";
  }
  appElement.dataset.transactionState = phase;
  appElement.dataset.drawerOpen = String(
    drawerProgress > 0.5 || drawerTarget > 0.5,
  );
  appElement.dataset.receiptCount = String(receiptCount);
  appElement.dataset.entry = entry;
}

function syncTelemetry(): void {
  appElement.dataset.itemCount = String(items.length);
  appElement.dataset.totalCents = String(runningTotal());
  appElement.dataset.displayCents = String(displayCents);
  appElement.dataset.cycleProgress = cycleProgress.toFixed(3);
  appElement.dataset.drawerProgress = drawerProgress.toFixed(3);
  appElement.dataset.receiptProgress = receiptProgress.toFixed(3);
  appElement.dataset.crankAngle = crankPivot.rotation.x.toFixed(3);
  appElement.dataset.gearAngles = gearGroups
    .map((gear) => gear.rotation.x.toFixed(3))
    .join(",");
  appElement.dataset.keyBailTravel = keyBailTravel.toFixed(3);
  appElement.dataset.totalClutch = totalClutchEngagement.toFixed(3);
  appElement.dataset.bellCharge = bellChargeAmount.toFixed(3);
  appElement.dataset.bellStrike = bellStrikeAmount.toFixed(3);
  appElement.dataset.bellCamAngle = (bellCam?.rotation.x ?? 0).toFixed(3);
  appElement.dataset.bellStrikerAngle = (
    strikerPivot?.rotation.z ?? bellStrikerRestAngle
  ).toFixed(3);
  appElement.dataset.bellDomeVibration = bellDomeVibration.toFixed(4);
  appElement.dataset.latchAngle = latchBolt.rotation.x.toFixed(3);
  appElement.dataset.receiptRollerAngles = [
    receiptFeedUpper.rotation.x,
    receiptFeedLower.rotation.x,
  ]
    .map((angle) => angle.toFixed(3))
    .join(",");
}

function updateDigitTargets(cents: number, immediate = false): void {
  displayCents = Math.max(0, Math.min(Math.round(cents), maxCents));
  const digits = String(displayCents).padStart(8, "0").slice(-8);

  for (let index = 0; index < 8; index += 1) {
    const nextDigit = Number.parseInt(digits[index], 10);
    if (immediate) {
      digitDrumTargets[index] = nextDigit * digitStep;
      digitDrumAngles[index] = digitDrumTargets[index];
      digitDrums[index].rotation.x = digitDrumAngles[index];
      continue;
    }

    const currentDigit =
      ((Math.round(digitDrumTargets[index] / digitStep) % 10) + 10) % 10;
    const forwardSteps = (nextDigit - currentDigit + 10) % 10;
    digitDrumTargets[index] += forwardSteps * digitStep;
  }
}

function paintReceipt(finalized: boolean): void {
  if (!receiptCanvas || !receiptContext || !receiptTexture) return;
  const context = receiptContext;
  const width = receiptCanvas.width;
  const height = receiptCanvas.height;

  context.fillStyle = "#f7f0de";
  context.fillRect(0, 0, width, height);

  context.fillStyle = "#1b1a17";
  context.textAlign = "center";
  context.textBaseline = "top";
  context.font = "700 32px monospace";
  context.fillText(receiptHeader, width / 2, 66);

  context.font = "500 22px monospace";
  context.fillText("1948 / REGISTER 02", width / 2, 112);

  context.strokeStyle = "#3c3932";
  context.lineWidth = 2;
  context.setLineDash([10, 8]);
  context.beginPath();
  context.moveTo(54, 164);
  context.lineTo(width - 54, 164);
  context.stroke();
  context.setLineDash([]);

  context.textAlign = "left";
  context.font = "600 27px monospace";
  items.forEach((item, index) => {
    const y = 206 + index * 58;
    context.fillText(`ITEM ${String(index + 1).padStart(2, "0")}`, 58, y);
    context.textAlign = "right";
    context.fillText(formatCents(item).replace("\u00a5", ""), width - 58, y);
    context.textAlign = "left";
  });

  const totalY = 226 + Math.max(items.length, 1) * 58;
  if (finalized) {
    context.strokeStyle = "#3c3932";
    context.beginPath();
    context.moveTo(54, totalY);
    context.lineTo(width - 54, totalY);
    context.stroke();
    context.font = "700 34px monospace";
    context.fillText("TOTAL", 58, totalY + 34);
    context.textAlign = "right";
    context.fillText(formatCents(runningTotal()), width - 58, totalY + 34);
    context.textAlign = "center";
    context.font = "500 20px monospace";
    context.fillText("THANK YOU", width / 2, totalY + 112);
  }

  for (let y = 24; y < height; y += 42) {
    context.fillStyle = "#d1c8b4";
    context.beginPath();
    context.arc(18, y, 3, 0, Math.PI * 2);
    context.arc(width - 18, y, 3, 0, Math.PI * 2);
    context.fill();
  }

  receiptTexture.needsUpdate = true;
}

function pulseKey(command: CashCommand): void {
  const mechanism =
    keyByCommand.get(command) ??
    (command === "BACKSPACE" ? keyByCommand.get("CLEAR") : undefined);
  if (!mechanism) return;
  mechanism.pulse = 0;
  playKeyClick();
}

function canAcceptSaleInput(): boolean {
  return (
    !cycleActive &&
    !receiptTearActive &&
    phase !== "drawer-closing" &&
    drawerTarget < 0.5 &&
    drawerProgress < 0.08 &&
    explodeTarget < 0.5
  );
}

function appendEntry(
  command: Extract<CashCommand, `${number}` | "00" | ".">,
): void {
  if (!canAcceptSaleInput()) {
    setStatus(drawerProgress > 0.08 ? "CLOSE DRAWER" : "BUSY");
    return;
  }

  if (receiptReady || phase === "complete") {
    items = [];
    entry = "";
    receiptReady = false;
    receiptProgress = 0.08;
    receiptTarget = 0.08;
    paintReceipt(false);
  }

  if (command === ".") {
    if (entry.includes(".")) return;
    entry = entry ? `${entry}.` : "0.";
  } else {
    const toAppend = command;
    const [whole = "", fraction] = entry.split(".");
    if (fraction !== undefined) {
      const remaining = 2 - fraction.length;
      if (remaining <= 0) return;
      entry = `${whole}.${fraction}${toAppend.slice(0, remaining)}`;
    } else {
      const normalizedWhole = whole === "0" ? "" : whole;
      if (normalizedWhole.length + toAppend.length > 6) return;
      entry = `${normalizedWhole}${toAppend}` || "0";
    }
  }

  phase = "editing";
  pulseKey(command);
  updateDigitTargets(entryToCents());
  setStatus("ENTERING");
  syncState();
}

function clearEntry(backspace = false): void {
  if (!canAcceptSaleInput()) return;
  if (backspace) {
    entry = entry.slice(0, -1);
    if (entry === "0") entry = "";
  } else {
    entry = "";
  }
  phase = items.length > 0 ? "items" : "idle";
  pulseKey(backspace ? "BACKSPACE" : "CLEAR");
  updateDigitTargets(entry ? entryToCents() : runningTotal());
  setStatus(backspace ? "BACKSPACE" : "CLEARED");
  syncState();
}

function addCurrentItem(
  options: { silentKey?: boolean; fromTotal?: boolean } = {},
): boolean {
  if (!canAcceptSaleInput()) return false;
  const cents = entryToCents();
  if (cents <= 0) {
    setStatus("ENTER AMOUNT");
    if (!options.silentKey) pulseKey("ADD");
    return false;
  }
  if (items.length >= maxItems || runningTotal() + cents > maxCents) {
    setStatus("LIMIT");
    return false;
  }

  items.push(cents);
  entry = "";
  phase = "items";
  driveAngleTarget += Math.PI * 0.72;
  receiptTarget = Math.min(0.18 + items.length * (0.44 / maxItems), 0.62);
  paintReceipt(false);
  updateDigitTargets(runningTotal());
  if (!options.silentKey) pulseKey("ADD");
  setStatus(options.fromTotal ? "TOTALING" : "LINE ADDED");
  syncState();
  return true;
}

function startTransaction(manual = false): boolean {
  if (!canAcceptSaleInput()) return false;

  if (
    entryToCents() > 0 &&
    !addCurrentItem({ silentKey: true, fromTotal: true })
  ) {
    pulseKey("TOTAL");
    return false;
  }
  if (items.length === 0) {
    pulseKey("TOTAL");
    setStatus("ENTER AMOUNT");
    return false;
  }

  pulseKey("TOTAL");
  phase = "finalizing";
  cycleActive = true;
  cycleAuto = !manual;
  cycleProgress = 0;
  cycleStartAngle = driveAngle;
  cycleStartReceipt = receiptProgress;
  cycleBellPlayed = false;
  cycleDrawerPlayed = false;
  lastRatchetTooth = -1;
  receiptReady = false;
  paintReceipt(true);
  updateDigitTargets(runningTotal());
  setStatus("CRANKING");
  syncState();
  return true;
}

function toggleDrawer(): void {
  if (cycleActive || receiptTearActive || explodeTarget > 0.5) return;
  if (phase === "drawer-closing") return;
  if (drawerProgress > 0.12 || drawerTarget > 0.5) {
    drawerTarget = 0;
    phase = "drawer-closing";
    setStatus("CLOSING");
    return;
  }

  if (phase !== "complete" && !receiptReady) {
    latchBolt.rotation.x = -0.12;
    window.setTimeout(() => {
      if (!destroyed) latchBolt.rotation.x = 0;
    }, 110);
    playKeyClick();
    setStatus("LOCKED");
    return;
  }

  drawerTarget = 1;
  setStatus("DRAWER OPEN");
}

function tearReceipt(): void {
  if (phase === "drawer-closing") {
    setStatus("CLOSING");
    return;
  }
  if (!receiptReady || receiptTearActive || !receiptMesh || !receiptMaterial) {
    setStatus("NO RECEIPT");
    return;
  }
  receiptTearActive = true;
  receiptTearTime = 0;
  phase = "tearing";
  playTone(220, 0.07, 0.024, "sawtooth");
  setStatus("TEARING");
  syncState();
}

function executeCommand(command: CashCommand, fromDemo = false): void {
  if (!fromDemo && demoElapsed >= 0) {
    demoElapsed = -1;
    demoIndex = 0;
  }

  if (/^[0-9]$/.test(command) || command === "00" || command === ".") {
    appendEntry(command as Extract<CashCommand, `${number}` | "00" | ".">);
    return;
  }

  if (command === "CLEAR") {
    clearEntry(false);
    return;
  }
  if (command === "BACKSPACE") {
    clearEntry(true);
    return;
  }
  if (command === "ADD") {
    addCurrentItem();
    return;
  }
  if (command === "TOTAL") {
    startTransaction(false);
    return;
  }
  if (command === "DRAWER") {
    toggleDrawer();
    return;
  }
  if (command === "TEAR") {
    tearReceipt();
  }
}

function resetSaleState(): void {
  entry = "";
  items = [];
  displayCents = 0;
  phase = "idle";
  receiptReady = false;
  receiptTearActive = false;
  receiptTearTime = 0;
  receiptProgress = 0.08;
  receiptTarget = 0.08;
  cycleActive = false;
  cycleAuto = false;
  cycleProgress = 0;
  drawerProgress = 0;
  drawerTarget = 0;
  driveAngle = 0;
  driveAngleTarget = 0;
  cycleBellPlayed = false;
  cycleDrawerPlayed = false;
  lastRatchetTooth = -1;
  demoElapsed = -1;
  demoIndex = 0;
  latchBolt.rotation.x = 0;
  keyBailTravel = 0;
  totalClutchEngagement = 0;
  for (const mechanism of keyMechanisms) {
    mechanism.pulse = -1;
    mechanism.group.position.y = Number(mechanism.group.userData.restY ?? 0);
    mechanism.lever.rotation.x = Number(
      mechanism.lever.userData.restRotationX ?? 0,
    );
    mechanism.selector.position.y = Number(
      mechanism.selector.userData.restY ?? 0,
    );
  }
  if (keyboardBail) {
    keyboardBail.position.y = Number(keyboardBail.userData.restY ?? 0);
  }
  applyControlLinkages(0, 0);
  applyBellMechanism(0);
  if (receiptMaterial) receiptMaterial.opacity = 1;
  if (receiptMesh) {
    receiptMesh.rotation.set(receiptTilt, 0, 0);
    receiptMesh.position.copy(receiptAnchor);
  }
  paintReceipt(false);
  updateDigitTargets(0, true);
  setStatus("READY");
  syncState();
}

function resetViewAndMachine(): void {
  controls.autoRotate = false;
  document
    .querySelector<HTMLButtonElement>('[data-action="rotate"]')
    ?.setAttribute("aria-pressed", "false");
  explodeTarget = 0;
  explodeAmount = 0;
  document
    .querySelector<HTMLButtonElement>('[data-action="explode"]')
    ?.setAttribute("aria-pressed", "false");
  resize();
  resetSaleState();
  controls.update();
}

function startDemo(): void {
  resetViewAndMachine();
  demoElapsed = 0;
  demoIndex = 0;
  setStatus("DEMO");
}

function updateDemo(delta: number): void {
  if (demoElapsed < 0) return;
  demoElapsed += delta;
  while (
    demoIndex < demoSequence.length &&
    demoElapsed >= demoSequence[demoIndex].at
  ) {
    executeCommand(demoSequence[demoIndex].command, true);
    demoIndex += 1;
  }
  if (demoIndex >= demoSequence.length) {
    demoElapsed = -1;
  }
}

function applyControlLinkages(addPulse: number, totalPulse: number): void {
  const engagement = cycleActive ? 1 : totalPulse;
  totalClutchEngagement = engagement;

  if (totalControlLink) {
    totalControlLink.position.y =
      Number(totalControlLink.userData.restY ?? 0) - engagement * 0.055;
  }
  if (totalClutchSleeve) {
    totalClutchSleeve.position.x =
      Number(totalClutchSleeve.userData.restX ?? 0) - engagement * 0.12;
  }
  if (addControlLink) {
    addControlLink.position.y =
      Number(addControlLink.userData.restY ?? 0) - addPulse * 0.045;
  }
  if (addPawlPivot) {
    addPawlPivot.rotation.z =
      Number(addPawlPivot.userData.restRotationZ ?? -0.22) - addPulse * 0.18;
  }
}

function updateKeyPulses(delta: number): void {
  let bailPulse = 0;
  let addPulse = 0;
  let totalPulse = 0;

  for (const mechanism of keyMechanisms) {
    let pulse = 0;
    if (mechanism.pulse >= 0) {
      mechanism.pulse += delta;
      const duration = reducedMotion ? 0.08 : 0.14;
      const progress = THREE.MathUtils.clamp(mechanism.pulse / duration, 0, 1);
      pulse = Math.sin(progress * Math.PI);

      if (progress >= 1) {
        mechanism.pulse = -1;
        pulse = 0;
      }
    }

    mechanism.group.position.y =
      Number(mechanism.group.userData.restY ?? 0) - pulse * 0.16;
    mechanism.lever.rotation.x =
      Number(mechanism.lever.userData.restRotationX ?? 0) + pulse * 0.38;
    mechanism.selector.position.y =
      Number(mechanism.selector.userData.restY ?? 0) - pulse * 0.09;

    if (/^(?:[0-9]|00|\.)$/.test(mechanism.command)) {
      bailPulse = Math.max(bailPulse, pulse);
    }
    if (mechanism.command === "ADD") addPulse = Math.max(addPulse, pulse);
    if (mechanism.command === "TOTAL") totalPulse = Math.max(totalPulse, pulse);
  }

  keyBailTravel = bailPulse * 0.075;
  if (keyboardBail) {
    keyboardBail.position.y =
      Number(keyboardBail.userData.restY ?? 0) - keyBailTravel;
  }
  applyControlLinkages(addPulse, totalPulse);
}

function updateDigitDrums(delta: number): void {
  for (let index = 0; index < digitDrums.length; index += 1) {
    digitDrumAngles[index] = reducedMotion
      ? digitDrumTargets[index]
      : THREE.MathUtils.damp(
          digitDrumAngles[index],
          digitDrumTargets[index],
          13 + index * 0.42,
          delta,
        );
    digitDrums[index].rotation.x = digitDrumAngles[index];
  }
}

function applyDriveAngle(): void {
  crankPivot.rotation.x = driveAngle;
  if (gearGroups.length >= 4) {
    gearGroups[0].rotation.x = gearPhaseOffsets[0] + driveAngle;
    gearGroups[1].rotation.x = gearPhaseOffsets[1] - driveAngle * (16 / 24);
    gearGroups[2].rotation.x = gearPhaseOffsets[2] + driveAngle * (16 / 32);
    gearGroups[3].rotation.x = gearPhaseOffsets[3] - driveAngle * (16 / 18);
  }
}

function applyBellMechanism(progress: number): void {
  const normalized = THREE.MathUtils.clamp(progress, 0, 1);
  const charge =
    THREE.MathUtils.smoothstep(normalized, 0.48, 0.57) *
    (1 - THREE.MathUtils.smoothstep(normalized, 0.59, 0.635));
  const impactProgress = THREE.MathUtils.clamp(
    (normalized - 0.63) / 0.09,
    0,
    1,
  );
  const impact =
    normalized >= 0.63 && normalized <= 0.72
      ? Math.sin(impactProgress * Math.PI)
      : 0;
  const ringProgress = THREE.MathUtils.clamp((normalized - 0.675) / 0.18, 0, 1);
  const vibration =
    normalized >= 0.675 && normalized <= 0.855
      ? Math.sin(ringProgress * Math.PI * 10) * (1 - ringProgress) * 0.012
      : 0;

  bellChargeAmount = charge;
  bellStrikeAmount = impact;
  bellDomeVibration = vibration;

  if (bellCam) {
    bellCam.rotation.x =
      Number(bellCam.userData.phaseOffset ?? 0) + normalized * Math.PI * 2;
  }
  if (bellFollower) {
    bellFollower.rotation.x =
      Number(bellFollower.userData.restRotationX ?? 0) - charge * 0.24;
  }
  if (bellPullRod) {
    bellPullRod.position.y =
      Number(bellPullRod.userData.restY ?? 0) + charge * 0.075;
  }
  if (bellSpring) {
    bellSpring.scale.y =
      Number(bellSpring.userData.restScaleY ?? 1) + charge * 0.18;
  }
  if (strikerPivot) {
    strikerPivot.rotation.z =
      Number(strikerPivot.userData.restRotationZ ?? bellStrikerRestAngle) +
      charge * 0.12 -
      impact * 0.24;
  }
  if (bellDome) bellDome.rotation.z = vibration;
}

function updateCycle(delta: number): void {
  if (!cycleActive) {
    driveAngle = reducedMotion
      ? driveAngleTarget
      : THREE.MathUtils.damp(driveAngle, driveAngleTarget, 8.5, delta);
    applyDriveAngle();
    applyBellMechanism(0);
    return;
  }

  if (cycleAuto) {
    const duration = reducedMotion ? 0.18 : 2.6;
    cycleProgress = Math.min(1, cycleProgress + delta / duration);
  }

  const progress = THREE.MathUtils.clamp(cycleProgress, 0, 1);
  driveAngle = cycleStartAngle + progress * Math.PI * 2;
  driveAngleTarget = driveAngle;
  applyDriveAngle();
  applyBellMechanism(progress);

  const ratchetTooth = Math.floor(progress * 20);
  if (ratchetTooth > lastRatchetTooth && progress < 0.82) {
    lastRatchetTooth = ratchetTooth;
    playRatchet();
  }

  if (progress >= 0.18) {
    const feedProgress = THREE.MathUtils.smoothstep(progress, 0.18, 0.76);
    receiptTarget = THREE.MathUtils.lerp(
      cycleStartReceipt,
      Math.min(0.94, 0.42 + items.length * 0.075),
      feedProgress,
    );
    if (progress < 0.62) setStatus("PRINTING");
  }

  if (progress >= 0.675 && !cycleBellPlayed) {
    cycleBellPlayed = true;
    playBell();
    setStatus("BELL");
  }

  const latchProgress = THREE.MathUtils.smoothstep(progress, 0.71, 0.8);
  latchBolt.rotation.x = -latchProgress * 0.68;

  if (progress >= 0.78) {
    drawerTarget = 1;
    if (!cycleDrawerPlayed) {
      cycleDrawerPlayed = true;
      playDrawerThump();
      setStatus("DRAWER OPEN");
    }
  }

  if (progress >= 1) {
    cycleActive = false;
    cycleAuto = false;
    cycleProgress = 1;
    phase = "complete";
    receiptReady = true;
    receiptCount += 1;
    applyBellMechanism(0);
    setStatus("RECEIPT READY");
    syncState();
  }
}

function updateReceipt(delta: number): void {
  if (!receiptMesh || !receiptTexture || !receiptMaterial) return;

  receiptProgress = reducedMotion
    ? receiptTarget
    : THREE.MathUtils.damp(receiptProgress, receiptTarget, 7.5, delta);
  const visible = THREE.MathUtils.clamp(receiptProgress, 0.06, 1);
  receiptMesh.scale.y = visible;
  receiptMesh.position.copy(receiptAnchor);
  receiptMesh.rotation.set(receiptTilt, 0, 0);
  receiptTexture.repeat.y = visible;
  receiptTexture.offset.y = 1 - visible;

  const rollerAngle = visible * 13.5;
  receiptRoll.rotation.x = -rollerAngle * 0.34;
  receiptFeedUpper.rotation.x = rollerAngle;
  receiptFeedLower.rotation.x = -rollerAngle * (0.16 / 0.14);

  if (!receiptTearActive) return;
  receiptTearTime += delta;
  const progress = THREE.MathUtils.clamp(
    receiptTearTime / (reducedMotion ? 0.14 : 0.68),
    0,
    1,
  );
  const eased = 1 - (1 - progress) ** 3;
  receiptMesh.position.y -= eased * 0.72;
  receiptMesh.position.z += eased * 1.25;
  receiptMesh.rotation.z = eased * 0.12;
  receiptMaterial.opacity = 1 - eased;

  if (progress >= 1) {
    receiptTearActive = false;
    receiptReady = false;
    receiptProgress = 0.08;
    receiptTarget = 0.08;
    receiptMaterial.opacity = 1;
    receiptMesh.rotation.set(receiptTilt, 0, 0);
    receiptMesh.position.copy(receiptAnchor);
    paintReceipt(false);
    phase = drawerProgress > 0.5 ? "complete" : "idle";
    setStatus(drawerProgress > 0.5 ? "DRAWER OPEN" : "READY");
    syncState();
  }
}

function updateDrawer(delta: number): void {
  drawerProgress = reducedMotion
    ? drawerTarget
    : THREE.MathUtils.damp(drawerProgress, drawerTarget, 6.6, delta);

  if (
    drawerTarget === 0 &&
    drawerProgress < 0.035 &&
    phase === "drawer-closing"
  ) {
    drawerProgress = 0;
    latchBolt.rotation.x = 0;
    entry = "";
    items = [];
    receiptReady = false;
    receiptProgress = 0.08;
    receiptTarget = 0.08;
    paintReceipt(false);
    updateDigitTargets(0);
    phase = "idle";
    playDrawerThump();
    setStatus("READY");
    syncState();
  }
}

function updateExplosion(delta: number): void {
  explodeAmount = reducedMotion
    ? explodeTarget
    : THREE.MathUtils.damp(explodeAmount, explodeTarget, 6.2, delta);
  const aspect = appElement.clientWidth / Math.max(appElement.clientHeight, 1);
  const spread = explodeAmount * (aspect < 0.78 ? 0.5 : 0.72);
  if (aspect < 0.78) {
    model.scale.setScalar(THREE.MathUtils.lerp(0.69, 0.6, explodeAmount));
  }
  for (const object of explodables) {
    const base = object.userData.basePosition;
    const vector = object.userData.explodeVector;
    if (!base || !vector) continue;
    const drawerOffset =
      object === drawerGroup ? drawerProgress * drawerTravel : 0;
    object.position.set(
      base[0] + vector[0] * spread,
      base[1] + vector[1] * spread,
      base[2] + vector[2] * spread + drawerOffset,
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

  let command: CashCommand | null = null;
  if (/^[0-9]$/.test(event.key)) command = event.key as CashCommand;
  if (event.key === ".") command = ".";
  if (event.key === "Backspace") command = "BACKSPACE";
  if (event.key === "Escape" || event.key.toLowerCase() === "c")
    command = "CLEAR";
  if (event.key === "+") command = "ADD";
  if (event.key === "Enter" || event.key === "=") command = "TOTAL";
  if (event.key.toLowerCase() === "d") command = "DRAWER";
  if (event.key.toLowerCase() === "r") command = "TEAR";
  if (!command) return;

  event.preventDefault();
  if (event.repeat && ["ADD", "TOTAL", "DRAWER", "TEAR"].includes(command))
    return;
  ensureAudio();
  executeCommand(command);
}

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let pointerInteraction: Interaction | null = null;
let pointerId: number | null = null;
let pointerStartX = 0;
let pointerStartY = 0;
let pointerLastAngle = 0;
let pointerTravel = 0;

function updatePointer(event: PointerEvent): void {
  const rect = canvasElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

function findInteraction(event: PointerEvent): Interaction | null {
  updatePointer(event);
  raycaster.setFromCamera(pointer, camera);
  const intersections = raycaster.intersectObjects(interactiveMeshes, false);
  for (const intersection of intersections) {
    const interaction = intersection.object.userData.interaction as
      | Interaction
      | undefined;
    if (interaction) return interaction;
  }
  return null;
}

function crankScreenAngle(event: PointerEvent): number {
  const world = new THREE.Vector3();
  crankPivot.getWorldPosition(world);
  world.project(camera);
  const rect = canvasElement.getBoundingClientRect();
  const centerX = rect.left + ((world.x + 1) / 2) * rect.width;
  const centerY = rect.top + ((1 - world.y) / 2) * rect.height;
  return Math.atan2(event.clientY - centerY, event.clientX - centerX);
}

function handlePointerDown(event: PointerEvent): void {
  const interaction = findInteraction(event);
  if (!interaction) return;

  ensureAudio();
  pointerInteraction = interaction;
  pointerId = event.pointerId;
  pointerStartX = event.clientX;
  pointerStartY = event.clientY;
  pointerTravel = 0;
  controls.enabled = false;
  canvasElement.setPointerCapture(event.pointerId);

  if (interaction.kind === "key") {
    executeCommand(interaction.command);
  } else if (interaction.kind === "drawer") {
    toggleDrawer();
  } else if (interaction.kind === "receipt") {
    tearReceipt();
  } else if (interaction.kind === "crank") {
    if (startTransaction(true)) {
      pointerLastAngle = crankScreenAngle(event);
    } else {
      pointerInteraction = null;
      controls.enabled = true;
    }
  }
}

function handlePointerMove(event: PointerEvent): void {
  if (!pointerInteraction) {
    const interaction = findInteraction(event);
    canvasElement.style.cursor = interaction ? "pointer" : "grab";
    return;
  }
  if (pointerId !== event.pointerId) return;

  pointerTravel = Math.max(
    pointerTravel,
    Math.hypot(event.clientX - pointerStartX, event.clientY - pointerStartY),
  );

  if (pointerInteraction.kind !== "crank" || !cycleActive) return;
  const nextAngle = crankScreenAngle(event);
  let delta = nextAngle - pointerLastAngle;
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  pointerLastAngle = nextAngle;
  cycleProgress = Math.min(
    0.94,
    cycleProgress + (Math.abs(delta) / (Math.PI * 2)) * 1.35,
  );
}

function finishPointerInteraction(): void {
  if (pointerInteraction?.kind === "crank" && cycleActive) {
    cycleAuto = true;
  }
  pointerInteraction = null;
  pointerId = null;
  controls.enabled = true;
  canvasElement.style.cursor = pointerTravel > 7 ? "grabbing" : "grab";
}

function releasePointer(event: PointerEvent): void {
  if (pointerId !== event.pointerId) return;
  if (canvasElement.hasPointerCapture(event.pointerId)) {
    canvasElement.releasePointerCapture(event.pointerId);
  }
  finishPointerInteraction();
}

function handleLostPointerCapture(event: PointerEvent): void {
  if (pointerId === event.pointerId) finishPointerInteraction();
}

function handleWindowBlur(): void {
  if (pointerInteraction) finishPointerInteraction();
}

function handlePointerLeave(event: PointerEvent): void {
  if (!pointerInteraction) canvasElement.style.cursor = "grab";
  if (pointerId === event.pointerId && event.buttons === 0)
    releasePointer(event);
}

function toggleReference(force?: boolean): void {
  if (!reference || !referenceButton) return;
  const open = force ?? !reference.classList.contains("is-open");
  reference.classList.toggle("is-open", open);
  reference.setAttribute("aria-hidden", String(!open));
  referenceButton.setAttribute("aria-pressed", String(open));
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
    const { GLTFExporter } =
      await import("three/examples/jsm/exporters/GLTFExporter.js");
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
        },
      );
    });
    const blob = new Blob([output], { type: "model/gltf-binary" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "mechanical-cash-register.glb";
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus("DOWNLOADED");
  } catch (error) {
    console.error(error);
    setStatus("EXPORT ERROR");
  }
}

function handleAction(event: Event): void {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
    "[data-action]",
  );
  if (!button) return;
  const action = button.dataset.action;
  ensureAudio();

  if (action === "demo") startDemo();
  if (action === "total") executeCommand("TOTAL");
  if (action === "explode") {
    if (cycleActive || drawerProgress > 0.08 || drawerTarget > 0.5) {
      setStatus("CLOSE DRAWER");
      return;
    }
    explodeTarget = explodeTarget > 0.5 ? 0 : 1;
    button.setAttribute("aria-pressed", String(explodeTarget === 1));
    setStatus(explodeTarget === 1 ? "EXPLODED" : "ASSEMBLING");
  }
  if (action === "rotate") {
    controls.autoRotate = !controls.autoRotate;
    button.setAttribute("aria-pressed", String(controls.autoRotate));
    setStatus(controls.autoRotate ? "ORBITING" : "READY");
  }
  if (action === "reset") resetViewAndMachine();
  if (action === "sound") {
    soundEnabled = !soundEnabled;
    button.setAttribute("aria-pressed", String(soundEnabled));
    button.setAttribute(
      "aria-label",
      soundEnabled ? "关闭机械声音" : "开启机械声音",
    );
    button.title = soundEnabled ? "关闭机械声音" : "开启机械声音";
    if (soundEnabled) playKeyClick();
    setStatus(soundEnabled ? "SOUND ON" : "MUTED");
  }
  if (action === "reference") toggleReference();
  if (action === "download") void downloadGlb();
  syncState();
}

function handleAccessibleCommand(event: Event): void {
  const button = event.currentTarget as HTMLButtonElement;
  const command = button.dataset.cashCommand as CashCommand | undefined;
  if (command) executeCommand(command);
}

function resize(): void {
  const width = appElement.clientWidth;
  const height = appElement.clientHeight;
  const aspect = width / Math.max(height, 1);
  renderer.setSize(width, height, false);
  renderer.setPixelRatio(
    Math.min(window.devicePixelRatio, aspect < 0.85 ? 1.5 : 2),
  );
  camera.aspect = aspect;

  if (aspect < 0.78) {
    camera.fov = 43;
    controls.maxDistance = 34;
    camera.position.set(9.6, 9.3, 20.5);
    controls.target.set(0, 2.0, 0.35);
    model.scale.setScalar(0.69);
  } else if (aspect < 1.35) {
    camera.fov = 35;
    controls.maxDistance = 32;
    camera.position.set(12.7, 9.3, 16.8);
    controls.target.set(0, 2.0, 0.2);
    model.scale.setScalar(0.92);
  } else {
    camera.fov = 30;
    controls.maxDistance = 24;
    camera.position.copy(cameraHome);
    controls.target.set(0, 2.05, 0.15);
    model.scale.setScalar(1);
  }
  camera.updateProjectionMatrix();
}

function snapshot(): CashRegisterSnapshot {
  return {
    phase,
    entry,
    itemCount: items.length,
    totalCents: runningTotal(),
    displayCents,
    cycleProgress,
    drawerProgress,
    drawerOpen: drawerProgress > 0.5 || drawerTarget > 0.5,
    receiptProgress,
    receiptCount,
    crankAngle: crankPivot.rotation.x,
    gearAngles: gearGroups.map((gear) => gear.rotation.x),
    keyBailTravel,
    totalClutchEngagement,
    bellCamAngle: bellCam?.rotation.x ?? 0,
    bellCharge: bellChargeAmount,
    bellStrike: bellStrikeAmount,
    bellStrikerAngle: strikerPivot?.rotation.z ?? bellStrikerRestAngle,
    bellDomeVibration,
    latchAngle: latchBolt.rotation.x,
    exploded: explodeAmount > 0.5,
    soundEnabled,
  };
}

function animate(): void {
  if (destroyed || !pageVisible) return;
  const currentFrameTime = performance.now();
  const delta = Math.min((currentFrameTime - previousFrameTime) / 1000, 0.05);
  previousFrameTime = currentFrameTime;

  updateDemo(delta);
  updateKeyPulses(delta);
  updateDigitDrums(delta);
  updateCycle(delta);
  updateReceipt(delta);
  updateDrawer(delta);
  updateExplosion(delta);
  syncTelemetry();
  controls.update();
  renderer.render(scene, camera);
  animationFrameId = requestAnimationFrame(animate);
}

function handleVisibilityChange(): void {
  pageVisible = document.visibilityState !== "hidden";
  if (pageVisible && !destroyed) {
    previousFrameTime = performance.now();
    cancelAnimationFrame(animationFrameId);
    animate();
  } else {
    if (pointerInteraction) finishPointerInteraction();
    cancelAnimationFrame(animationFrameId);
  }
}

function handleReferenceClose(): void {
  toggleReference(false);
}

actionButtons.forEach((button) =>
  button.addEventListener("click", handleAction),
);
accessibleCommandButtons.forEach((button) =>
  button.addEventListener("click", handleAccessibleCommand),
);
referenceCloseButton?.addEventListener("click", handleReferenceClose);
window.addEventListener("keydown", handleKeyboardInput);
window.addEventListener("resize", resize);
window.addEventListener("blur", handleWindowBlur);
document.addEventListener("visibilitychange", handleVisibilityChange);
canvasElement.addEventListener("pointerdown", handlePointerDown);
canvasElement.addEventListener("pointermove", handlePointerMove);
canvasElement.addEventListener("pointerup", releasePointer);
canvasElement.addEventListener("pointercancel", releasePointer);
canvasElement.addEventListener("pointerleave", handlePointerLeave);
canvasElement.addEventListener("lostpointercapture", handleLostPointerCapture);

paintReceipt(false);
updateDigitTargets(0, true);
resize();
syncState();
controls.update();
renderer.compileAsync(scene, camera).finally(() => {
  if (destroyed) return;
  loading?.classList.add("is-hidden");
  setStatus("READY");
});
animate();

window.__mechanicalCashRegister = {
  command: executeCommand,
  snapshot,
  destroy: () => {
    destroyed = true;
    cancelAnimationFrame(animationFrameId);
    actionButtons.forEach((button) =>
      button.removeEventListener("click", handleAction),
    );
    accessibleCommandButtons.forEach((button) =>
      button.removeEventListener("click", handleAccessibleCommand),
    );
    referenceCloseButton?.removeEventListener("click", handleReferenceClose);
    window.removeEventListener("keydown", handleKeyboardInput);
    window.removeEventListener("resize", resize);
    window.removeEventListener("blur", handleWindowBlur);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    canvasElement.removeEventListener("pointerdown", handlePointerDown);
    canvasElement.removeEventListener("pointermove", handlePointerMove);
    canvasElement.removeEventListener("pointerup", releasePointer);
    canvasElement.removeEventListener("pointercancel", releasePointer);
    canvasElement.removeEventListener("pointerleave", handlePointerLeave);
    canvasElement.removeEventListener(
      "lostpointercapture",
      handleLostPointerCapture,
    );
    controls.dispose();
    renderer.dispose();

    const geometries = new Set<THREE.BufferGeometry>();
    scene.traverse((object) => {
      if (object instanceof THREE.Mesh) geometries.add(object.geometry);
    });
    geometries.forEach((geometry) => geometry.dispose());
    disposableMaterials.forEach((material) => material.dispose());
    textures.forEach((texture) => texture.dispose());
    if (audioContext) void audioContext.close();
  },
};
