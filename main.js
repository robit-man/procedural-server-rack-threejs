// main.js
// Procedural datacenter with optimized render loop, shadows, better micro-geometry, and
// additional slacked cables running from scaffolding to backs of server blades.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

// -----------------------------------------------------
// Global config (1 unit = 1 meter)
// -----------------------------------------------------

const CONFIG = {
  rackHeight: 2.0,
  rackWidth: 0.6,
  rackDepth: 1.0,

  bladeHeight: 0.044,
  bladeWidth: 0.58,
  bladeDepth: 0.9,

  rackRows: 2,
  racksPerRow: 6,

  aisleWidth: 1.4,
  rackSpacing: 0.15,

  rackFillMin: 0.7,
  rackFillMax: 0.9,

  scaffoldHeight: 3.0
};

// Rack frame
const POST_SIZE = 0.05;

// Blade placement
const BLADE_FRONT_INSET = 0.08;

// Micro-detail sizes
const VENT_WIDTH = 0.45;
const VENT_HEIGHT = 0.004;
const VENT_DEPTH = 0.008;

const DRIVE_W = 0.09;
const DRIVE_H = 0.035;
const DRIVE_D = 0.01;

const HANDLE_W = 0.02;
const HANDLE_H = 0.04;
const HANDLE_D = 0.01;

const BUTTON_W = 0.01;
const BUTTON_H = 0.01;
const BUTTON_D = 0.005;

const LED_SIZE = 0.005;

// Shared geometry container
const GEO = {};

// Scene globals
let scene, camera, renderer, controls, composer, clock;
let bloomPass;
let MATERIALS = {};
const racks = [];
const leds = [];

// Small optimization: skip LED updates some frames on very heavy scenes
const LED_UPDATE_INTERVAL = 1 / 90; // seconds
let ledAccumulator = 0;

// -----------------------------------------------------
// Init
// -----------------------------------------------------

init();
animate();

function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050509);
  scene.fog = new THREE.FogExp2(0x000000, 0.06);

  clock = new THREE.Clock();

  // Camera
  const aspect = window.innerWidth / window.innerHeight;
  camera = new THREE.PerspectiveCamera(55, aspect, 0.1, 200);
  camera.position.set(8, 3.5, 8);
  camera.lookAt(0, 1, 0);

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)); // limit for perf
  renderer.physicallyCorrectLights = true;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  // Shadows
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  document.body.appendChild(renderer.domElement);

  // Controls
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 1, 0);
  controls.minDistance = 3;
  controls.maxDistance = 40;
  controls.minPolarAngle = 0.1;
  controls.maxPolarAngle = Math.PI / 2.05;

  // Materials & shared geometry
  MATERIALS = createMaterials();
  createSharedGeometries();

  // Environment, lights, racks, scaffolding, cables, post
  createEnvironment();
  createLights();
  createRacks();
  createScaffolding();
  createCables(); // includes rack-to-rack, rack-to-scaffold, and scaffold-to-blades
  setupPostProcessing();

  window.addEventListener('resize', onWindowResize);
}

// -----------------------------------------------------
// Materials & Geometry
// -----------------------------------------------------

function createMaterials() {
  const rackFrame = new THREE.MeshStandardMaterial({
    color: 0x050505,
    roughness: 0.7,
    metalness: 0.25
  });

  const blade = new THREE.MeshStandardMaterial({
    color: 0xdddddd,
    roughness: 0.2,
    metalness: 0.9
  });

  const bladeDark = new THREE.MeshStandardMaterial({
    color: 0x111111,
    roughness: 0.8,
    metalness: 0.2
  });

  const bladeDetailLight = new THREE.MeshStandardMaterial({
    color: 0x333333,
    roughness: 0.6,
    metalness: 0.3
  });

  const cable = new THREE.MeshStandardMaterial({
    color: 0x202020,
    roughness: 0.9,
    metalness: 0.1
  });

  const thinCable = new THREE.MeshStandardMaterial({
    color: 0x181818,
    roughness: 0.9,
    metalness: 0.1
  });

  const floor = new THREE.MeshStandardMaterial({
    color: 0x050505,
    roughness: 0.4,
    metalness: 0.2
  });

  const wall = new THREE.MeshStandardMaterial({
    color: 0x101014,
    roughness: 0.8,
    metalness: 0.1
  });

  const scaffold = new THREE.MeshStandardMaterial({
    color: 0x101010,
    roughness: 0.8,
    metalness: 0.3
  });

  return {
    rackFrame,
    blade,
    bladeDark,
    bladeDetailLight,
    cable,
    thinCable,
    floor,
    wall,
    scaffold,
    ledColors: [0x00ff00, 0x0088ff, 0xffaa00]
  };
}

function createSharedGeometries() {
  GEO.rackPost = new THREE.BoxGeometry(POST_SIZE, CONFIG.rackHeight, POST_SIZE);
  GEO.rackTop = new THREE.BoxGeometry(CONFIG.rackWidth, 0.05, CONFIG.rackDepth);

  GEO.blade = new THREE.BoxGeometry(
    CONFIG.bladeWidth,
    CONFIG.bladeHeight,
    CONFIG.bladeDepth
  );

  GEO.vent = new THREE.BoxGeometry(VENT_WIDTH, VENT_HEIGHT, VENT_DEPTH);
  GEO.driveBay = new THREE.BoxGeometry(DRIVE_W, DRIVE_H, DRIVE_D);
  GEO.handle = new THREE.BoxGeometry(HANDLE_W, HANDLE_H, HANDLE_D);
  GEO.button = new THREE.BoxGeometry(BUTTON_W, BUTTON_H, BUTTON_D);
  GEO.led = new THREE.BoxGeometry(LED_SIZE, LED_SIZE, LED_SIZE);
}

// -----------------------------------------------------
// Environment (floor, walls, HDRI)
// -----------------------------------------------------

function createEnvironment() {
  // Floor sized to cover racks and some margin
  const rowSpanX =
    CONFIG.racksPerRow * (CONFIG.rackWidth + CONFIG.rackSpacing) - CONFIG.rackSpacing;
  const floorSizeX = rowSpanX + 4;
  const floorSizeZ = CONFIG.aisleWidth + CONFIG.rackDepth * 2 + 4;

  const floorGeom = new THREE.PlaneGeometry(floorSizeX, floorSizeZ);
  const floor = new THREE.Mesh(floorGeom, MATERIALS.floor);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0;
  floor.receiveShadow = true;
  scene.add(floor);

  // Simple surrounding walls
  const wallHeight = 3.2;

  const wallGeomX = new THREE.PlaneGeometry(floorSizeX, wallHeight);
  const wallGeomZ = new THREE.PlaneGeometry(floorSizeZ, wallHeight);

  const wallFront = new THREE.Mesh(wallGeomX, MATERIALS.wall);
  wallFront.position.set(0, wallHeight / 2, -floorSizeZ / 2);
  wallFront.receiveShadow = true;
  scene.add(wallFront);

  const wallBack = new THREE.Mesh(wallGeomX, MATERIALS.wall);
  wallBack.position.set(0, wallHeight / 2, floorSizeZ / 2);
  wallBack.rotation.y = Math.PI;
  wallBack.receiveShadow = true;
  scene.add(wallBack);

  const wallLeft = new THREE.Mesh(wallGeomZ, MATERIALS.wall);
  wallLeft.position.set(-floorSizeX / 2, wallHeight / 2, 0);
  wallLeft.rotation.y = Math.PI / 2;
  wallLeft.receiveShadow = true;
  scene.add(wallLeft);

  const wallRight = new THREE.Mesh(wallGeomZ, MATERIALS.wall);
  wallRight.position.set(floorSizeX / 2, wallHeight / 2, 0);
  wallRight.rotation.y = -Math.PI / 2;
  wallRight.receiveShadow = true;
  scene.add(wallRight);

  // HDRI environment for reflections / indirect light
  const hdrUrl =
    'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/equirectangular/moonless_golf_1k.hdr';

  const rgbeLoader = new RGBELoader();
  rgbeLoader.load(
    hdrUrl,
    (texture) => {
      texture.mapping = THREE.EquirectangularReflectionMapping;
      scene.environment = texture; // background stays dark for moody look
    },
    undefined,
    (err) => {
      console.warn('Failed to load HDRI environment:', err);
    }
  );
}

// -----------------------------------------------------
// Lights
// -----------------------------------------------------

function createLights() {
  // Subtle cool ambient
  const ambient = new THREE.AmbientLight(0x202030, 0.3);
  scene.add(ambient);

  // Overhead point lights along the aisle
  const lightColor = new THREE.Color(0xa0b0ff);
  const aisleZ = 0;
  const rowSpanX =
    CONFIG.racksPerRow * (CONFIG.rackWidth + CONFIG.rackSpacing) - CONFIG.rackSpacing;
  const halfSpanX = rowSpanX / 2;
  const numLights = 4;

  for (let i = 0; i < numLights; i++) {
    const t = numLights === 1 ? 0.5 : i / (numLights - 1);
    const x = THREE.MathUtils.lerp(-halfSpanX, halfSpanX, t);
    const y = CONFIG.scaffoldHeight + 0.3;

    const light = new THREE.PointLight(lightColor, 18, 14);
    light.position.set(x, y, aisleZ);
    light.castShadow = true;
    light.shadow.mapSize.set(512, 512);
    light.shadow.bias = -0.0004;
    scene.add(light);
  }
}

// -----------------------------------------------------
// Racks & Blades
// -----------------------------------------------------

function createRacks() {
  const numRows = CONFIG.rackRows; // 2
  const perRow = CONFIG.racksPerRow;

  // Racks laid out along X, rows mirrored across Z (fronts face central aisle at Z=0)
  const rowSpanX =
    perRow * (CONFIG.rackWidth + CONFIG.rackSpacing) - CONFIG.rackSpacing;
  const startX = -rowSpanX / 2;

  const rowOffsetZ = CONFIG.aisleWidth / 2 + CONFIG.rackDepth / 2;

  for (let rowIndex = 0; rowIndex < numRows; rowIndex++) {
    const isTopRow = rowIndex === 0; // arbitrary
    const z = isTopRow ? rowOffsetZ : -rowOffsetZ;
    const rotationY = isTopRow ? 0 : Math.PI; // make fronts face aisle at Z=0

    for (let i = 0; i < perRow; i++) {
      const x = startX + i * (CONFIG.rackWidth + CONFIG.rackSpacing);
      const rack = createRack(rowIndex, i, new THREE.Vector3(x, 0, z), rotationY);
      racks.push(rack);
      scene.add(rack);
    }
  }
}

/**
 * Create a single rack Group with:
 * - frameGroup (5 boxes)
 * - bladesGroup (procedural blades)
 * - backAnchor / overheadAnchor
 */
function createRack(rowIndex, indexInRow, position, rotationY) {
  const rack = new THREE.Group();
  rack.position.copy(position);
  rack.rotation.y = rotationY;

  const frameGroup = new THREE.Group();
  const { rackWidth, rackHeight, rackDepth } = CONFIG;
  const postHalf = POST_SIZE / 2;

  const postPositions = [
    new THREE.Vector3(
      -rackWidth / 2 + postHalf,
      rackHeight / 2,
      -rackDepth / 2 + postHalf
    ), // front-left
    new THREE.Vector3(
      rackWidth / 2 - postHalf,
      rackHeight / 2,
      -rackDepth / 2 + postHalf
    ), // front-right
    new THREE.Vector3(
      -rackWidth / 2 + postHalf,
      rackHeight / 2,
      rackDepth / 2 - postHalf
    ), // back-left
    new THREE.Vector3(
      rackWidth / 2 - postHalf,
      rackHeight / 2,
      rackDepth / 2 - postHalf
    ) // back-right
  ];

  for (const pos of postPositions) {
    const post = new THREE.Mesh(GEO.rackPost, MATERIALS.rackFrame);
    post.position.copy(pos);
    post.castShadow = true;
    post.receiveShadow = true;
    frameGroup.add(post);
  }

  const top = new THREE.Mesh(GEO.rackTop, MATERIALS.rackFrame);
  top.position.set(0, rackHeight - 0.025, 0);
  top.castShadow = true;
  top.receiveShadow = true;
  frameGroup.add(top);

  rack.add(frameGroup);

  // Back anchor: mid-height, back center
  const backAnchor = new THREE.Object3D();
  backAnchor.position.set(0, rackHeight / 2, rackDepth / 2);
  rack.add(backAnchor);

  // Overhead anchor: directly above back anchor
  const overheadAnchor = new THREE.Object3D();
  overheadAnchor.position.set(0, CONFIG.scaffoldHeight, rackDepth / 2);
  rack.add(overheadAnchor);

  const bladesGroup = new THREE.Group();
  rack.add(bladesGroup);

  rack.userData.rowIndex = rowIndex;
  rack.userData.indexInRow = indexInRow;
  rack.userData.backAnchor = backAnchor;
  rack.userData.overheadAnchor = overheadAnchor;
  rack.userData.frameGroup = frameGroup;
  rack.userData.bladesGroup = bladesGroup;

  createRackBlades(rack);

  return rack;
}

/**
 * Procedurally fill rack with blades. ~70–90% occupancy.
 */
function createRackBlades(rack) {
  const bladesGroup = rack.userData.bladesGroup;
  const { rackHeight, bladeHeight, rackDepth } = CONFIG;

  const maxSlots = Math.floor(rackHeight / bladeHeight);
  const numSlots = Math.min(42, maxSlots); // clamp for realism
  const fillRatio = THREE.MathUtils.lerp(
    CONFIG.rackFillMin,
    CONFIG.rackFillMax,
    Math.random()
  );

  for (let slot = 0; slot < numSlots; slot++) {
    if (Math.random() > fillRatio) continue; // leave some empty slots

    const blade = createBlade();
    const y = bladeHeight / 2 + slot * bladeHeight;
    const z = -rackDepth / 2 + BLADE_FRONT_INSET;

    blade.position.set(0, y, z);
    bladesGroup.add(blade);
  }
}

/**
 * Create a single blade with:
 * - base chassis
 * - front micro features (vents, drive bays, handle, labels),
 *   protruding slightly to avoid z-fighting
 * - LED array
 * - back connector anchor for cable routing
 */
function createBlade() {
  const group = new THREE.Group();

  const chassis = new THREE.Mesh(GEO.blade, MATERIALS.blade);
  chassis.castShadow = true;
  chassis.receiveShadow = true;
  group.add(chassis);

  // Back connector (for cables from scaffolding to blade backside)
  const backConnector = new THREE.Object3D();
  backConnector.position.set(0, 0, CONFIG.bladeDepth / 2);
  group.add(backConnector);
  group.userData.backConnector = backConnector;

  // Front micro-details live in this group, positioned slightly in front of chassis
  const frontGroup = new THREE.Group();
  // Push forward ~2mm to avoid z-fighting with chassis front face
  frontGroup.position.z = -CONFIG.bladeDepth / 2 - 0.002;

  // Vents: thin slats across the front
  const numVents = 4;
  const ventSpacing = 0.006;
  const ventsStartY = -0.012;

  for (let i = 0; i < numVents; i++) {
    const vent = new THREE.Mesh(GEO.vent, MATERIALS.bladeDark);
    vent.position.set(0, ventsStartY + i * ventSpacing, VENT_DEPTH / 2);
    vent.castShadow = true;
    frontGroup.add(vent);
  }

  // Drive bays: small rectangles off to one side
  const drivesY = 0.006;
  const driveOffsetX = 0.14;

  for (let i = 0; i < 3; i++) {
    const drive = new THREE.Mesh(GEO.driveBay, MATERIALS.bladeDetailLight);
    drive.position.set(
      driveOffsetX - i * (DRIVE_W + 0.01),
      drivesY,
      DRIVE_D / 2
    );
    drive.castShadow = true;
    frontGroup.add(drive);
  }

  // Handle on left side
  const handle = new THREE.Mesh(GEO.handle, MATERIALS.bladeDetailLight);
  handle.position.set(
    -CONFIG.bladeWidth / 2 + HANDLE_W / 2 + 0.01,
    0,
    HANDLE_D / 2
  );
  handle.castShadow = true;
  frontGroup.add(handle);

  // Tiny button / label near top-right
  const button = new THREE.Mesh(GEO.button, MATERIALS.bladeDark);
  button.position.set(
    CONFIG.bladeWidth / 2 - BUTTON_W / 2 - 0.03,
    CONFIG.bladeHeight / 4,
    BUTTON_D / 2
  );
  button.castShadow = true;
  frontGroup.add(button);

  // LED array
  createBladeLEDs(frontGroup);

  group.add(frontGroup);

  return group;
}

/**
 * Create 2–3 LEDs on the blade's front and register them in a global array
 * for animation.
 */
function createBladeLEDs(parentFrontGroup) {
  const numLEDs = 2 + Math.floor(Math.random() * 2); // 2–3 for perf
  const ledSpacing = 0.006;
  const startY = -0.015;
  const x = CONFIG.bladeWidth / 2 - 0.045;

  for (let i = 0; i < numLEDs; i++) {
    const colorHex =
      MATERIALS.ledColors[
        Math.floor(Math.random() * MATERIALS.ledColors.length)
      ];

    const ledMaterial = new THREE.MeshStandardMaterial({
      color: 0x000000,
      emissive: new THREE.Color(colorHex),
      emissiveIntensity: 2.5,
      metalness: 0.8,
      roughness: 0.2
    });

    const led = new THREE.Mesh(GEO.led, ledMaterial);
    led.position.set(x, startY + i * ledSpacing, LED_SIZE / 2 + 0.002);
    led.castShadow = false;
    parentFrontGroup.add(led);

    // Store animation metadata
    const modes = ['blink', 'pulse', 'flicker'];
    const mode = modes[Math.floor(Math.random() * modes.length)];

    leds.push({
      material: ledMaterial,
      blinkFrequency: THREE.MathUtils.randFloat(0.5, 3.0),
      phaseOffset: Math.random() * Math.PI * 2,
      mode,
      minIntensity: THREE.MathUtils.randFloat(0.05, 0.2),
      maxIntensity: THREE.MathUtils.randFloat(2.5, 4.0)
    });
  }
}

// -----------------------------------------------------
// Scaffolding (overhead beams / trays)
// -----------------------------------------------------

function createScaffolding() {
  const height = CONFIG.scaffoldHeight;
  const thickness = 0.1;

  // Group racks by row and compute row extents / back lines
  const rows = {};
  for (const rack of racks) {
    const rowIndex = rack.userData.rowIndex;
    if (!rows[rowIndex]) rows[rowIndex] = [];
    rows[rowIndex].push(rack);
  }

  const backZs = [];
  let globalXMin = Infinity;
  let globalXMax = -Infinity;

  Object.keys(rows).forEach((key) => {
    const rowRacks = rows[key];
    // Sort by indexInRow to ensure proper ordering
    rowRacks.sort((a, b) => a.userData.indexInRow - b.userData.indexInRow);

    let xMin = Infinity;
    let xMax = -Infinity;
    let zBack = null;

    const temp = new THREE.Vector3();

    for (const rack of rowRacks) {
      rack.userData.backAnchor.getWorldPosition(temp);
      xMin = Math.min(xMin, temp.x);
      xMax = Math.max(xMax, temp.x);
      if (zBack === null) zBack = temp.z;
    }

    globalXMin = Math.min(globalXMin, xMin);
    globalXMax = Math.max(globalXMax, xMax);
    backZs.push(zBack);

    const length = (xMax - xMin) + 1.0; // small margin
    const beamGeom = new THREE.BoxGeometry(length, thickness, thickness);
    const beam = new THREE.Mesh(beamGeom, MATERIALS.scaffold);
    beam.position.set((xMin + xMax) / 2, height, zBack);
    beam.castShadow = true;
    beam.receiveShadow = true;
    scene.add(beam);
  });

  // Cross beams between the two rows
  if (backZs.length >= 2) {
    const z0 = backZs[0];
    const z1 = backZs[1];
    const crossLength = Math.abs(z0 - z1) + 0.5;
    const crossGeom = new THREE.BoxGeometry(thickness, thickness, crossLength);
    const zMid = (z0 + z1) / 2;
    const span = globalXMax - globalXMin;
    const spacing = 2.5;

    for (let x = globalXMin - 0.5; x <= globalXMax + 0.5; x += spacing) {
      const cross = new THREE.Mesh(crossGeom, MATERIALS.scaffold);
      cross.position.set(x, height, zMid);
      cross.castShadow = true;
      cross.receiveShadow = true;
      scene.add(cross);
    }
  }
}

// -----------------------------------------------------
// Cables (back-to-back, rack-to-overhead, scaffold-to-blades)
// -----------------------------------------------------

function createCables() {
  const cableMaterial = MATERIALS.cable;
  const thinCableMaterial = MATERIALS.thinCable;

  // Group racks by row for back-to-back cabling
  const rows = {};
  for (const rack of racks) {
    const rowIndex = rack.userData.rowIndex;
    if (!rows[rowIndex]) rows[rowIndex] = [];
    rows[rowIndex].push(rack);
  }

  // Back-to-back cables between adjacent racks in each row
  Object.keys(rows).forEach((key) => {
    const rowRacks = rows[key];
    rowRacks.sort((a, b) => a.userData.indexInRow - b.userData.indexInRow);

    const p1 = new THREE.Vector3();
    const p2 = new THREE.Vector3();

    for (let i = 0; i < rowRacks.length - 1; i++) {
      const rackA = rowRacks[i];
      const rackB = rowRacks[i + 1];

      rackA.userData.backAnchor.getWorldPosition(p1);
      rackB.userData.backAnchor.getWorldPosition(p2);

      const cablesBetween = 2; // keep low for performance

      for (let c = 0; c < cablesBetween; c++) {
        const offsetY = (c - (cablesBetween - 1) / 2) * 0.03;

        const p1c = p1.clone();
        const p2c = p2.clone();
        p1c.y += offsetY;
        p2c.y += offsetY;

        const mid = p1c.clone().add(p2c).multiplyScalar(0.5);
        // Sag
        mid.y -= THREE.MathUtils.randFloat(0.2, 0.35);
        // Tiny lateral jitter
        mid.x += (Math.random() - 0.5) * 0.05;
        mid.z += (Math.random() - 0.5) * 0.05;

        const points = [p1c, mid, p2c];
        createCable(points, cableMaterial, { minRadius: 0.014, maxRadius: 0.018 });
      }
    }
  });

  // Rack-to-overhead trunk cables
  const pRack = new THREE.Vector3();
  const pOver = new THREE.Vector3();

  for (const rack of racks) {
    rack.userData.backAnchor.getWorldPosition(pRack);
    rack.userData.overheadAnchor.getWorldPosition(pOver);

    const cablesCount = 1; // trunk cable per rack

    for (let i = 0; i < cablesCount; i++) {
      const p1 = pRack.clone();

      const p2 = pRack.clone();
      p2.y += 0.6 + Math.random() * 0.3;

      const mid = p2.clone().lerp(pOver, 0.5);
      mid.x += (Math.random() - 0.5) * 0.25;
      mid.z += (Math.random() - 0.5) * 0.25;
      mid.y -= THREE.MathUtils.randFloat(0.1, 0.25); // slight slack

      const p4 = pOver.clone();
      p4.x += (Math.random() - 0.5) * 0.15;
      p4.z += (Math.random() - 0.5) * 0.15;

      const points = [p1, p2, mid, p4];
      createCable(points, cableMaterial, { minRadius: 0.012, maxRadius: 0.016 });
    }
  }

  // Scaffolding-to-blade cables (slacked data cables to backs of server blades)
  const pBlade = new THREE.Vector3();
  const pScaffold = new THREE.Vector3();

  for (const rack of racks) {
    const bladesGroup = rack.userData.bladesGroup;
    const blades = bladesGroup.children;
    if (!blades.length) continue;

    // Get overhead anchor world pos once per rack
    rack.userData.overheadAnchor.getWorldPosition(pScaffold);

    // Choose a subset of blades per rack
    const bladesToWire = Math.min(4, blades.length);
    const chosenIndices = new Set();
    while (chosenIndices.size < bladesToWire) {
      chosenIndices.add(Math.floor(Math.random() * blades.length));
    }

    for (const idx of chosenIndices) {
      const blade = blades[idx];
      const backConnector = blade.userData.backConnector;
      if (!backConnector) continue;

      backConnector.getWorldPosition(pBlade);

      // Cable path: scaffold -> downward slack -> towards blade -> blade back
      const p1 = pScaffold.clone();
      const p4 = pBlade.clone();

      const p2 = p1.clone();
      p2.y -= THREE.MathUtils.randFloat(0.25, 0.45);

      const mid = p1.clone().lerp(p4, 0.5);
      mid.y -= THREE.MathUtils.randFloat(0.15, 0.3); // sag
      mid.x += (Math.random() - 0.5) * 0.1;
      mid.z += (Math.random() - 0.5) * 0.1;

      const points = [p1, p2, mid, p4];
      createCable(points, thinCableMaterial, { minRadius: 0.007, maxRadius: 0.01 });
    }
  }
}

function createCable(points, material, { minRadius, maxRadius }) {
  const curve = new THREE.CatmullRomCurve3(points);
  curve.curveType = 'catmullrom';
  curve.tension = 0.5;

  // Slightly reduced segments for better performance
  const tubularSegments = 18;
  const radius = THREE.MathUtils.randFloat(minRadius, maxRadius);
  const radialSegments = 6;

  const geometry = new THREE.TubeGeometry(
    curve,
    tubularSegments,
    radius,
    radialSegments,
    false
  );
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  scene.add(mesh);
}

// -----------------------------------------------------
// Post-processing (bloom)
// -----------------------------------------------------

function setupPostProcessing() {
  const width = window.innerWidth;
  const height = window.innerHeight;

  composer = new EffectComposer(renderer);

  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  // Use smaller internal resolution for bloom to keep things lighter
  bloomPass = new UnrealBloomPass(
    new THREE.Vector2(width / 2, height / 2),
    1.6,
    0.4,
    0.16
  );
  bloomPass.threshold = 0.16;
  bloomPass.strength = 1.6;
  bloomPass.radius = 0.32;
  composer.addPass(bloomPass);
}

// -----------------------------------------------------
// Animation
// -----------------------------------------------------

function animate() {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();
  const elapsed = clock.elapsedTime;

  // Throttled LED updates for performance
  ledAccumulator += delta;
  if (ledAccumulator >= LED_UPDATE_INTERVAL) {
    updateLEDs(elapsed);
    ledAccumulator = 0;
  }

  controls.update();
  composer.render();
}

function updateLEDs(time) {
  for (const led of leds) {
    const {
      material,
      blinkFrequency,
      phaseOffset,
      mode,
      minIntensity,
      maxIntensity
    } = led;

    const s = Math.sin(time * blinkFrequency * Math.PI * 2 + phaseOffset);
    let intensity;

    if (mode === 'blink') {
      const on = s > 0.4;
      intensity = on ? maxIntensity : minIntensity;
    } else if (mode === 'pulse') {
      const t = 0.5 + 0.5 * s; // 0..1
      intensity = minIntensity + (maxIntensity - minIntensity) * t;
    } else {
      // flicker: noisy, jittery intensity
      const noise =
        0.5 +
        0.5 * Math.sin(time * blinkFrequency * 3.7 + phaseOffset * 1.3);
      intensity =
        minIntensity + (maxIntensity - minIntensity) * Math.abs(s) * noise;
    }

    material.emissiveIntensity = intensity;
  }
}

// -----------------------------------------------------
// Resize
// -----------------------------------------------------

function onWindowResize() {
  const width = window.innerWidth;
  const height = window.innerHeight;

  camera.aspect = width / height;
  camera.updateProjectionMatrix();

  renderer.setSize(width, height);
  composer.setSize(width, height);

  if (bloomPass) {
    bloomPass.setSize(width / 2, height / 2);
  }
}
