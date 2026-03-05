import "./style.css";
import * as THREE from "three";

/* -----------------------------
   DOM
------------------------------ */
const canvas = /** @type {HTMLCanvasElement|null} */ (
  document.getElementById("three-canvas")
);
const statusEl = /** @type {HTMLElement|null} */ (document.getElementById("status"));

if (!canvas) throw new Error("Missing <canvas id='three-canvas'>");
if (!statusEl) throw new Error("Missing #status element");

/* -----------------------------
   RENDERER / SCENE / CAMERA
------------------------------ */
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color("#b9d2df");
scene.fog = new THREE.Fog("#b9d2df", 20, 90);

const camera = new THREE.PerspectiveCamera(
  80,
  window.innerWidth / window.innerHeight,
  0.1,
  300
);
camera.position.set(10, 7.5, 12);

const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

/* -----------------------------
   LIGHTING
------------------------------ */
const hemi = new THREE.HemisphereLight("#dff6ff", "#5f7f55", 0.6);
scene.add(hemi);

const sunLight = new THREE.DirectionalLight("#fff4d6", 1.7);
sunLight.position.set(2, 12, -8);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.left = -15;
sunLight.shadow.camera.right = 15;
sunLight.shadow.camera.top = 15;
sunLight.shadow.camera.bottom = -15;
scene.add(sunLight);
sunLight.target.position.set(0, 0, 0);
scene.add(sunLight.target);

/* -----------------------------
   GROUND / MOUNDS
------------------------------ */
const ground = new THREE.Mesh(
  new THREE.CircleGeometry(38, 96),
  new THREE.MeshStandardMaterial({ color: "#668951", roughness: 0.95, metalness: 0 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const soilMat = new THREE.MeshStandardMaterial({ color: "#795641", roughness: 0.95 });
const moundGeo = new THREE.CylinderGeometry(0.6, 1.9, 0.9, 24);

/** @type {THREE.Mesh[]} */
const mounds = [];

function addMound(pos) {
  const mound = new THREE.Mesh(moundGeo, soilMat.clone());
  mound.position.copy(pos);
  mound.castShadow = true;
  mound.receiveShadow = true;
  mound.userData.type = "mound";
  scene.add(mound);
  mounds.push(mound);
  return mound;
}

let activeMound = addMound(new THREE.Vector3(0, 0.45, 0));
const windDirection = new THREE.Vector3(1, 0, 0.5).normalize();

/* -----------------------------
   GRASS
------------------------------ */
function addGrass() {
  const count = 14000;
  const blade = new THREE.PlaneGeometry(0.12, 1.1, 1, 4);
  blade.translate(0, 0.55, 0);

  const mat = new THREE.MeshStandardMaterial({ color: "#7bb05a", side: THREE.DoubleSide, roughness: 0.9 });

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.time = { value: 0 };
    shader.uniforms.windStrength = { value: 0 };
    shader.vertexShader = `uniform float time;\nuniform float windStrength;\n${shader.vertexShader}`;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      float baseSway = sin(time * 1.7 + instanceMatrix[3][0] * 0.6 + instanceMatrix[3][2] * 0.4) * 0.12;
      float gustSway = sin(time * 4.0 + instanceMatrix[3][0] * 1.2) * windStrength * 0.45;
      float sway = baseSway + gustSway;
      transformed.x += sway * uv.y;
      transformed.z += sway * 0.25 * uv.y;`
    );
    mat.userData.shader = shader;
  };

  const grass = new THREE.InstancedMesh(blade, mat, count);
  grass.castShadow = true;
  grass.receiveShadow = true;

  const dummy = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    const r = Math.sqrt(Math.random()) * 35;
    const a = Math.random() * Math.PI * 2;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const exclusion = activeMound.position.distanceTo(new THREE.Vector3(x, activeMound.position.y, z));
    dummy.position.set(exclusion < 2.6 ? 999 : x, 0, exclusion < 2.6 ? -999 : z);
    dummy.rotation.y = Math.random() * Math.PI;
    dummy.scale.setScalar(0.65 + Math.random() * 0.8);
    dummy.updateMatrix();
    grass.setMatrixAt(i, dummy.matrix);
  }
  scene.add(grass);
  return grass;
}
const grass = addGrass();

/* -----------------------------
   CLOUDS
------------------------------ */
function createFluffyCloud() {
  const cloudGroup = new THREE.Group();
  for (let i = 0; i < 15; i++) {
    const radius = 0.8 + Math.random() * 0.6;
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 12, 12),
      new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 1, opacity: 0.9, transparent: true })
    );
    sphere.castShadow = true;
    sphere.position.set((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 1, (Math.random() - 0.5) * 2);
    cloudGroup.add(sphere);
  }
  cloudGroup.userData.type = "cloud";
  cloudGroup.userData.draggable = true;
  return cloudGroup;
}

const clouds = [];
// Store the original spawn positions so we can send clouds home after the gust
const cloudHomePositions = [];

for (let i = 0; i < 3; i++) {
  const cloud = createFluffyCloud();
  const homePos = new THREE.Vector3(-10 + i * 8, 11 + (i % 2), -4 + (i % 2));
  cloud.position.copy(homePos);
  cloudHomePositions.push(homePos.clone());
  scene.add(cloud);
  clouds.push(cloud);
}

// Whether clouds are currently animating back to their home positions
let cloudsReturning = false;

/**
 * Gently lerp all clouds back to their original positions each frame.
 * Called from the render loop while cloudsReturning is true.
 * @param {number} dt
 */
function updateCloudsReturning(dt) {
  if (!cloudsReturning) return;
  let allHome = true;
  for (let i = 0; i < clouds.length; i++) {
    clouds[i].position.lerp(cloudHomePositions[i], dt * 1.4);
    if (clouds[i].position.distanceTo(cloudHomePositions[i]) > 0.05) allHome = false;
  }
  if (allHome) {
    // Snap exactly and stop
    for (let i = 0; i < clouds.length; i++) clouds[i].position.copy(cloudHomePositions[i]);
    cloudsReturning = false;
  }
}

/* -----------------------------
   SUN
------------------------------ */
const sunGroup = new THREE.Group();
sunGroup.add(
  new THREE.Mesh(new THREE.SphereGeometry(0.7, 24, 24), new THREE.MeshBasicMaterial({ color: "#ffffff" })),
  new THREE.Mesh(new THREE.SphereGeometry(1.0, 24, 24), new THREE.MeshBasicMaterial({ color: "#ffe18a", transparent: true, opacity: 0.6 })),
  new THREE.Mesh(new THREE.SphereGeometry(1.5, 24, 24), new THREE.MeshBasicMaterial({ color: "#ffdb4d", transparent: true, opacity: 0.3 }))
);
sunGroup.position.set(2, 12, -8);
sunGroup.userData.type = "sun";
scene.add(sunGroup);
const sun = sunGroup;

/* -----------------------------
   SUN RAYS
------------------------------ */
const lightCone = new THREE.Mesh(
  new THREE.ConeGeometry(2, 15, 32, 1, true),
  new THREE.MeshBasicMaterial({ color: "#fff4d6", transparent: true, opacity: 0.2, side: THREE.DoubleSide })
);
lightCone.visible = false;
scene.add(lightCone);

/* -----------------------------
   RAIN
------------------------------ */
const rainCount = 1200;
// Each drop = 2 vertices (top + bottom of streak), so 6 floats per drop
const rainPos = new Float32Array(rainCount * 6);
const rainVel = new Float32Array(rainCount);
const rainStreak = new Float32Array(rainCount);
for (let i = 0; i < rainCount; i++) {
  const x = (Math.random() - 0.5) * 4;
  const y = Math.random() * 12;
  const z = (Math.random() - 0.5) * 4;
  const spd = 8 + Math.random() * 7;
  const len = 0.13 + Math.random() * 0.1;
  rainVel[i] = spd;
  rainStreak[i] = len;
  // top vertex
  rainPos[i * 6]     = x;
  rainPos[i * 6 + 1] = y;
  rainPos[i * 6 + 2] = z;
  // bottom vertex (streak below top)
  rainPos[i * 6 + 3] = x;
  rainPos[i * 6 + 4] = y - len;
  rainPos[i * 6 + 5] = z;
}
const rainGeo = new THREE.BufferGeometry();
rainGeo.setAttribute("position", new THREE.BufferAttribute(rainPos, 3));
const rainMat = new THREE.LineBasicMaterial({ color: "#c8e8ff", transparent: true, opacity: 0 });
const rain = new THREE.LineSegments(rainGeo, rainMat);

/* -----------------------------
   PLANT
------------------------------ */
const stem = new THREE.Mesh(
  new THREE.CylinderGeometry(0.07, 0.1, 1.5, 16),
  new THREE.MeshStandardMaterial({ color: "#6ea557" })
);
stem.position.y = 1.05;
stem.castShadow = true;

const bud = new THREE.Mesh(
  new THREE.SphereGeometry(0.22, 16, 16),
  new THREE.MeshStandardMaterial({ color: "#d6c555", roughness: 0.7 })
);
bud.position.y = 1.8;
bud.castShadow = true;

const puff = new THREE.Group();
for (let i = 0; i < 80; i++) {
  const p = new THREE.Mesh(
    new THREE.SphereGeometry(0.04, 8, 8),
    new THREE.MeshStandardMaterial({ color: "#f6f8ff", emissive: "#ffffff", emissiveIntensity: 0.1 })
  );
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(2 * Math.random() - 1);
  const rad = 0.28 + Math.random() * 0.16;
  p.position.set(Math.sin(phi) * Math.cos(theta) * rad, Math.cos(phi) * rad, Math.sin(phi) * Math.sin(theta) * rad);
  puff.add(p);
}
puff.position.y = 1.9;
puff.visible = false;

const plant = new THREE.Group();
plant.add(stem, bud, puff);
plant.position.copy(activeMound.position);
plant.visible = false;
scene.add(plant);

/* ==============================================
   WIND VISUAL SYSTEM
   ============================================== */

const WIND_POOL_SIZE = 80;
/** @typedef {{tube: THREE.Mesh, life: number, maxLife: number, vel: THREE.Vector3, mat: THREE.MeshBasicMaterial}} WindRibbon */
/** @type {WindRibbon[]} */
const windPool = [];

for (let i = 0; i < WIND_POOL_SIZE; i++) {
  const geo = new THREE.BufferGeometry();
  const mat = new THREE.MeshBasicMaterial({ color: "#c8e8ff", transparent: true, opacity: 0, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  scene.add(mesh);
  windPool.push({ tube: mesh, life: 0, maxLife: 1, vel: new THREE.Vector3(), mat });
}

const SWIRL_COUNT = 60;
const swirlPositions = new Float32Array(SWIRL_COUNT * 3);
/** @type {{angle: number, radius: number, height: number, speed: number}[]} */
const swirlData = [];
for (let i = 0; i < SWIRL_COUNT; i++) {
  swirlData.push({
    angle: (i / SWIRL_COUNT) * Math.PI * 2,
    radius: 0.4 + Math.random() * 0.8,
    height: (Math.random() - 0.5) * 1.2,
    speed: 2.5 + Math.random() * 3.5,
  });
}
const swirlGeo = new THREE.BufferGeometry();
swirlGeo.setAttribute("position", new THREE.BufferAttribute(swirlPositions, 3));
const swirlMat = new THREE.PointsMaterial({ color: "#e0f4ff", size: 0.06, transparent: true, opacity: 0 });
const swirlPoints = new THREE.Points(swirlGeo, swirlMat);
scene.add(swirlPoints);

const MOTE_COUNT = 220;
const motePositions = new Float32Array(MOTE_COUNT * 3);
/** @type {THREE.Vector3[]} */
const moteVelocities = [];
for (let i = 0; i < MOTE_COUNT; i++) {
  motePositions[i * 3]     = (Math.random() - 0.5) * 6;
  motePositions[i * 3 + 1] = 1 + Math.random() * 3;
  motePositions[i * 3 + 2] = (Math.random() - 0.5) * 6;
  moteVelocities.push(new THREE.Vector3(0, 0, 0));
}
const moteGeo = new THREE.BufferGeometry();
moteGeo.setAttribute("position", new THREE.BufferAttribute(motePositions, 3));
const moteMat = new THREE.PointsMaterial({ color: "#dff4ff", size: 0.065, transparent: true, opacity: 0 });
const motes = new THREE.Points(moteGeo, moteMat);
scene.add(motes);

let globalWindStrength = 0;
let windGustTimer = 0;
const WIND_GUST_DURATION = 4.5;

function spawnWindRibbon(origin, strength) {
  const slot = windPool.find(w => w.life <= 0);
  if (!slot) return;

  const len = 2.0 + strength * 5 + Math.random() * 2.5;
  const spread = 0.5 + Math.random() * 0.7;
  const arcHeight = 0.2 + Math.random() * 0.55;
  const pts = [];
  const SEGS = 10;
  for (let i = 0; i <= SEGS; i++) {
    const t = i / SEGS;
    pts.push(new THREE.Vector3(
      origin.x + t * len,
      origin.y + Math.sin(t * Math.PI) * arcHeight + (Math.random() - 0.5) * 0.15,
      origin.z + Math.sin(t * Math.PI * 2.3) * spread * 0.4 + (Math.random() - 0.5) * spread * 0.6
    ));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const tubeR = 0.012 + Math.random() * 0.022 * strength;
  const geo = new THREE.TubeGeometry(curve, 28, tubeR, 5, false);
  slot.tube.geometry.dispose();
  slot.tube.geometry = geo;
  slot.tube.position.set(0, 0, 0);
  const hue = Math.random();
  slot.mat.color.setStyle(hue > 0.6 ? "#e8f8ff" : hue > 0.3 ? "#c8e8ff" : "#aad8f8");
  slot.mat.opacity = 0.2 + strength * 0.55;
  slot.maxLife = 0.6 + Math.random() * 0.9;
  slot.life    = slot.maxLife;
  slot.vel.set(2.0 + strength * 3.0 + Math.random() * 0.8, (Math.random() - 0.5) * 0.25, (Math.random() - 0.5) * 0.35);
}

function triggerGustVisuals(epicenter) {
  globalWindStrength = 1;
  windGustTimer = WIND_GUST_DURATION;

  for (let i = 0; i < 35; i++) {
    const jitter = new THREE.Vector3(
      (Math.random() - 0.5) * 2.5,
      0.2 + Math.random() * 1.5,
      (Math.random() - 0.5) * 2.5
    );
    spawnWindRibbon(epicenter.clone().add(jitter), 0.5 + Math.random() * 0.5);
  }

  swirlMat.opacity = 0.8;
  moteMat.opacity = 0.75;
  const mp = moteGeo.attributes.position.array;
  for (let i = 0; i < MOTE_COUNT; i++) {
    mp[i * 3]     = epicenter.x + (Math.random() - 0.5) * 5;
    mp[i * 3 + 1] = 0.6 + Math.random() * 4;
    mp[i * 3 + 2] = epicenter.z + (Math.random() - 0.5) * 3;
    moteVelocities[i].set(2.5 + Math.random() * 4, 0.05 + Math.random() * 0.5, (Math.random() - 0.5) * 0.8);
  }
  moteGeo.attributes.position.needsUpdate = true;
}

function updateWindVisuals(dt, elapsed, seedPos) {
  if (windGustTimer > 0) {
    windGustTimer -= dt;
    globalWindStrength = Math.max(0, windGustTimer / WIND_GUST_DURATION);
    if (seedPos && Math.random() < dt * 18) {
      spawnWindRibbon(
        seedPos.clone().add(new THREE.Vector3(-1.2 + Math.random() * 0.4, (Math.random() - 0.5) * 1.0, (Math.random() - 0.5) * 1.2)),
        globalWindStrength * 0.8
      );
    }
  } else {
    globalWindStrength = Math.max(0, globalWindStrength - dt * 0.55);
    swirlMat.opacity  = Math.max(0, swirlMat.opacity  - dt * 1.2);
    moteMat.opacity   = Math.max(0, moteMat.opacity   - dt * 0.6);
  }

  const shader = grass.material.userData.shader;
  if (shader) {
    shader.uniforms.time.value = elapsed;
    shader.uniforms.windStrength.value = globalWindStrength;
  }

  for (const w of windPool) {
    if (w.life <= 0) continue;
    w.life -= dt;
    w.tube.position.addScaledVector(w.vel, dt);
    w.mat.opacity = (w.life / w.maxLife) * (0.18 + globalWindStrength * 0.45);
    if (w.life <= 0) w.mat.opacity = 0;
  }

  if (swirlMat.opacity > 0.01 && seedPos) {
    const sp = swirlGeo.attributes.position.array;
    for (let i = 0; i < SWIRL_COUNT; i++) {
      const d = swirlData[i];
      d.angle += d.speed * dt;
      const r = d.radius * (0.6 + 0.4 * Math.sin(elapsed * 1.4 + i));
      sp[i * 3]     = seedPos.x + Math.cos(d.angle) * r;
      sp[i * 3 + 1] = seedPos.y + d.height + Math.sin(elapsed * 2 + i * 0.3) * 0.15;
      sp[i * 3 + 2] = seedPos.z + Math.sin(d.angle) * r;
    }
    swirlGeo.attributes.position.needsUpdate = true;
  }

  if (moteMat.opacity > 0.01) {
    const mp = moteGeo.attributes.position.array;
    for (let i = 0; i < MOTE_COUNT; i++) {
      moteVelocities[i].y += Math.sin(elapsed * 1.3 + i * 0.22) * 0.06 * dt;
      mp[i * 3]     += moteVelocities[i].x * dt;
      mp[i * 3 + 1] += moteVelocities[i].y * dt;
      mp[i * 3 + 2] += moteVelocities[i].z * dt;
      if (mp[i * 3] > 45 || mp[i * 3 + 1] > 8 || mp[i * 3 + 1] < 0) {
        mp[i * 3]     = (Math.random() - 0.5) * 6;
        mp[i * 3 + 1] = 0.5 + Math.random() * 2.5;
        mp[i * 3 + 2] = (Math.random() - 0.5) * 4;
        moteVelocities[i].set(0, 0, 0);
      }
    }
    moteGeo.attributes.position.needsUpdate = true;
  }
}

/* ==============================================
   SEEDS
   ============================================== */
/**
 * @typedef {{
 *   mesh: THREE.Mesh,
 *   velocity: THREE.Vector3,
 *   active: boolean,
 *   landed: boolean,
 *   gustApplied: boolean,
 *   phase: 'normal'|'outbound'|'returning',
 *   phaseTimer: number,
 *   startPos: THREE.Vector3,
 *   peakPos: THREE.Vector3,
 *   returnProgress: number,
 *   spinAxis: THREE.Vector3,
 *   spinSpeed: number
 * }} SeedEntry
 */

/** @type {SeedEntry[]} */
const seeds = [];

const tmpV3 = new THREE.Vector3();

const dragOffset = new THREE.Vector3();
const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -8.5);

/** @type {THREE.Object3D|null} */
let dragging = null;

let growth = 0;
let rainActive = false;
let wetness = 0;
/** @type {SeedEntry|null} */
let followedSeed = null;
let rainClouds = null;

/* -----------------------------
   SELECTION UI
------------------------------ */
/** @type {SeedEntry|null} */
let selectedSeed = null;

const selectionRingGeo = new THREE.RingGeometry(0.12, 0.18, 24);
const selectionRingMat = new THREE.MeshBasicMaterial({ color: "#ffdd44", side: THREE.DoubleSide, transparent: true, opacity: 0.9 });
const selectionRing = new THREE.Mesh(selectionRingGeo, selectionRingMat);
selectionRing.rotation.x = -Math.PI / 2;
selectionRing.visible = false;
scene.add(selectionRing);

const windGust = { active: false, applied: false };
let lastMousePos = { x: 0, y: 0 };
let gustAccumulator = 0;
const GUST_THRESHOLD = 180;

const gustMeterContainer = document.createElement("div");
gustMeterContainer.style.cssText = `
  position: fixed; bottom: 60px; left: 50%; transform: translateX(-50%);
  width: 210px; background: rgba(0,0,0,0.38); border-radius: 20px;
  padding: 7px 14px; display: none; flex-direction: column;
  align-items: center; gap: 5px; font-family: 'Georgia', serif;
  color: #fff; font-size: 12px; letter-spacing: 0.08em;
  backdrop-filter: blur(6px);
`;
gustMeterContainer.innerHTML = `
  <span>🌬 WAVE MOUSE TO GUST</span>
  <div style="width:100%;height:9px;background:rgba(255,255,255,0.15);border-radius:5px;overflow:hidden;">
    <div id="gust-bar" style="height:100%;width:0%;background:linear-gradient(90deg,#6ec6ff,#ffffff);border-radius:5px;transition:width 0.08s;"></div>
  </div>
`;
document.body.appendChild(gustMeterContainer);
const gustBar = document.getElementById("gust-bar");

/* -----------------------------
   GAME STATE
------------------------------ */
const state = { planted: false, watered: false, blooming: false, puff: false };
function setStatus(text) { statusEl.textContent = text; }

function resetCycle(reuseSameMound = false) {
  state.planted = reuseSameMound;
  state.watered = false;
  state.blooming = false;
  state.puff = false;

  rainActive = false;
  wetness = 0;
  growth = 0;
  followedSeed = null;
  selectedSeed = null;
  gustAccumulator = 0;
  selectionRing.visible = false;
  gustMeterContainer.style.display = "none";
  windGust.active = false;
  windGust.applied = false;
  rainMat.opacity = 0;

  plant.visible = false;
  puff.visible = false;
  bud.visible = false;
  stem.scale.y = 0.01;
  stem.position.y = 0.06;
  plant.position.copy(activeMound.position);

  if (reuseSameMound) {
    /** @type {THREE.MeshStandardMaterial} */ (activeMound.material).color.set("#795641");
    /** @type {THREE.MeshStandardMaterial} */ (activeMound.material).roughness = 0.95;
  }
}

function startRain(cloudList = null) {
  if (!state.planted || rainActive || state.watered) return;
  rainActive = true;
  rainClouds = cloudList;
  scene.add(rain);
  if (cloudList) setStatus("Rain started! Move clouds over the mound to water it.");
}

function toNdc(event) {
  pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
}

/* -----------------------------
   SELECT / DESELECT
------------------------------ */
function selectSeed(seed) {
  selectedSeed = seed;
  windGust.active = true;
  windGust.applied = false;
  gustAccumulator = 0;
  gustMeterContainer.style.display = "flex";
  selectionRing.visible = true;
  if (gustBar) gustBar.style.width = "0%";
  setStatus("Seed selected! Wave your mouse rapidly near it to create a gust!");
}

function deselectSeed() {
  selectedSeed = null;
  windGust.active = false;
  gustAccumulator = 0;
  gustMeterContainer.style.display = "none";
  selectionRing.visible = false;
}

/* -----------------------------
   INPUT
------------------------------ */
window.addEventListener("pointerdown", (event) => {
  toNdc(event);
  raycaster.setFromCamera(pointer, camera);

  const hits = raycaster.intersectObjects(
    [activeMound, sun, ...clouds, bud, ...seeds.map(s => s.mesh)], true
  );
  if (!hits.length) return;

  const target = hits[0].object;

  if (target.userData.type === "cloud" || target.parent?.userData.type === "cloud" ||
      target.userData.draggable || target.parent?.userData.draggable) {
    const cloudGroup = target.parent?.userData.type === "cloud" ? target.parent
      : target.parent?.userData.draggable ? target.parent : target;
    if (!state.planted) return;
    if (!rainActive) {
      dragging = cloudGroup;
      if (raycaster.ray.intersectPlane(dragPlane, tmpV3)) {
        dragOffset.set(tmpV3.x - cloudGroup.position.x, 0, tmpV3.z - cloudGroup.position.z);
      } else {
        dragOffset.set(0, 0, 0);
      }
    }
    return;
  }

  if (target === activeMound && !state.planted) {
    state.planted = true;
    plant.visible = true;
    stem.scale.y = 0.01;
    stem.position.y = 0.06;
    bud.visible = false;
    setStatus("Great. Make it rain by dragging the clouds together over the mound, and then clicking a cloud to make it rain!");
    return;
  }

  if ((target === sun || target.parent === sun) && state.watered && !state.puff) {
    state.blooming = true;
    lightCone.visible = true;
    setStatus("Sunlight helps it grow. Wait for bloom...");
    return;
  }

  const pickedSeed = seeds.find(s => s.mesh === target);
  if (pickedSeed) {
    if (pickedSeed.landed && pickedSeed.phase === 'normal' && !pickedSeed.gustApplied) {
      selectedSeed === pickedSeed ? deselectSeed() : selectSeed(pickedSeed);
    }
    return;
  }

  if (target === bud && state.puff) disperseSeeds();
});


window.addEventListener("pointerup", () => {
  dragging = null;
  dragOffset.set(0, 0, 0);
});

window.addEventListener("pointermove", (event) => {
  if (dragging && !rainActive) {
    toNdc(event);
    raycaster.setFromCamera(pointer, camera);

    if (raycaster.ray.intersectPlane(dragPlane, tmpV3)) {
      const br = 12;
      dragging.position.x = THREE.MathUtils.clamp(tmpV3.x, activeMound.position.x - br, activeMound.position.x + br);
      dragging.position.z = THREE.MathUtils.clamp(tmpV3.z, activeMound.position.z - br, activeMound.position.z + br);
      const nextX = tmpV3.x - dragOffset.x;
      const nextZ = tmpV3.z - dragOffset.z;
      dragging.position.x = THREE.MathUtils.clamp(nextX, activeMound.position.x - br, activeMound.position.x + br);
      dragging.position.z = THREE.MathUtils.clamp(nextZ, activeMound.position.z - br, activeMound.position.z + br);
    }
  }

  if (windGust.active && selectedSeed && !windGust.applied) {
    const dx = event.clientX - lastMousePos.x;
    const dy = event.clientY - lastMousePos.y;
    const speed = Math.sqrt(dx * dx + dy * dy);

    if (speed > 8) {
      toNdc(event);
      const screenSeed = selectedSeed.mesh.position.clone().project(camera);
      const ndcDist = Math.sqrt(
        (pointer.x - screenSeed.x) ** 2 + (pointer.y - screenSeed.y) ** 2
      );

      if (ndcDist < 0.45) {
        gustAccumulator += speed;
        if (gustBar) gustBar.style.width = Math.min(100, (gustAccumulator / GUST_THRESHOLD) * 100) + "%";
        if (gustAccumulator >= GUST_THRESHOLD) applyWindGust(selectedSeed);
      }
    }
  }

  lastMousePos = { x: event.clientX, y: event.clientY };
});

/* ==============================================
   APPLY WIND GUST
   ============================================== */
function applyWindGust(seed) {
  windGust.applied = true;
  seed.gustApplied = true;
  seed.landed = false;
  seed.active = true;
  seed.phase = 'outbound';
  seed.phaseTimer = 0;
  seed.returnProgress = 0;

  seed.startPos = seed.mesh.position.clone();

  seed.spinAxis = new THREE.Vector3(
    Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5
  ).normalize();
  seed.spinSpeed = (5 + Math.random() * 7) * (Math.random() > 0.5 ? 1 : -1);

  seed.velocity.set(9 + Math.random() * 3, 2.8 + Math.random() * 1.8, (Math.random() - 0.5) * 1.0);

  triggerGustVisuals(seed.mesh.position.clone());

  // --- While the seed is out of view, clean up the scene ---
  // Remove all OTHER seeds (not the gust seed) from the scene
  for (const s of seeds) {
    if (s === seed) continue;
    scene.remove(s.mesh);
    s.active = false;
    s.landed = true; // prevent further updates
  }
  // Clear the seeds array down to just the active gust seed
  seeds.length = 0;
  seeds.push(seed);

  // Send clouds drifting back to their original home positions
  cloudsReturning = true;

  followedSeed = seed;
  deselectSeed();
  setStatus("Away it goes! Watch the seed soar...");
}

/* -----------------------------
   DISPERSE SEEDS
------------------------------ */
function disperseSeeds() {
  if (!state.puff) return;
  state.puff = false;
  puff.visible = false;
  bud.visible = false;

  for (let i = 0; i < 36; i++) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.055, 10, 10),
      new THREE.MeshStandardMaterial({ color: "#f6f8ff" })
    );
    mesh.castShadow = true;
    mesh.userData.type = "seed";
    scene.add(mesh);

    const ang = Math.random() * Math.PI * 2;
    const rad = 0.18 + Math.random() * 0.22;
    mesh.position.copy(plant.position).add(new THREE.Vector3(Math.cos(ang) * rad, 1.8, Math.sin(ang) * rad));

    const baseVel = new THREE.Vector3((Math.random() - 0.5) * 0.75, -(0.02 + Math.random() * 0.10), (Math.random() - 0.5) * 0.75);
    const gDir = new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
    const breeze = windDirection.clone().multiplyScalar(0.03 + Math.random() * 0.06);

    seeds.push({
      mesh,
      velocity: baseVel.add(gDir.multiplyScalar(0.10 + Math.random() * 0.22)).add(breeze),
      active: true,
      landed: false,
      gustApplied: false,
      phase: 'normal',
      phaseTimer: 0,
      startPos: new THREE.Vector3(),
      peakPos: new THREE.Vector3(),
      returnProgress: 0,
      spinAxis: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(),
      spinSpeed: (Math.random() - 0.5) * 3,
    });
  }

  setStatus("Seeds dispersed! Click a landed seed, then wave your mouse to send it on a journey!");
}

/* ==============================================
   UPDATE RAIN
   ============================================== */
function updateRain(dt, elapsed) {
  if (rainActive) {
    let spawnCX = activeMound.position.x, spawnCZ = activeMound.position.z;
    if (rainClouds && rainClouds.length > 0) {
      const c = averageCloudCenter(rainClouds);
      spawnCX = c.x; spawnCZ = c.z;
    }

    let isOverMound = false;
    if (rainClouds && rainClouds.length > 0) {
      isOverMound = rainClouds.every(c => {
        const dx = c.position.x - activeMound.position.x;
        const dz = c.position.z - activeMound.position.z;
        return Math.sqrt(dx * dx + dz * dz) < 8;
      });
    }

    if (isOverMound) {
      wetness = Math.min(1, wetness + dt * 0.25);
      rainMat.opacity = Math.min(0.9, wetness);
      if (wetness < 1) setStatus("Success! The clouds are watering the mound!");
    } else {
      rainMat.opacity = 0.9;
      setStatus("Position ALL clouds over the mound to water it!");
    }

    const dryC = new THREE.Color("#795641"), wetC = new THREE.Color("#50392b");
    const mMat = /** @type {THREE.MeshStandardMaterial} */ (activeMound.material);
    mMat.color.copy(dryC.clone().lerp(wetC, wetness));
    mMat.roughness = THREE.MathUtils.lerp(0.95, 0.35, wetness);

    const pos = /** @type {Float32Array} */ (rain.geometry.attributes.position.array);
    for (let i = 0; i < rainCount; i++) {
      // Move top vertex straight down
      pos[i * 6 + 1] -= rainVel[i] * dt;
      // Respawn when drop hits the ground
      if (pos[i * 6 + 1] < 0.5) {
        pos[i * 6]     = spawnCX + (Math.random() - 0.5) * 3.8;
        pos[i * 6 + 1] = 10 + Math.random() * 2;
        pos[i * 6 + 2] = spawnCZ + (Math.random() - 0.5) * 3.8;
      }
      // Bottom vertex directly below top
      const len = rainStreak[i];
      pos[i * 6 + 3] = pos[i * 6];
      pos[i * 6 + 4] = pos[i * 6 + 1] - len;
      pos[i * 6 + 5] = pos[i * 6 + 2];
    }
    rain.geometry.attributes.position.needsUpdate = true;
  } else {
    rainMat.opacity = Math.max(0, rainMat.opacity - dt * 0.8);
    const dryC = new THREE.Color("#795641"), wetC = new THREE.Color("#50392b");
    const mMat = /** @type {THREE.MeshStandardMaterial} */ (activeMound.material);
    mMat.color.copy(dryC.clone().lerp(wetC, wetness));
    mMat.roughness = THREE.MathUtils.lerp(0.95, 0.35, wetness);
  }

  if (wetness >= 1 && !state.watered) {
    state.watered = true;
    rainActive = false;
    scene.remove(rain);
    setStatus("Now click the sun to trigger growth.");
  }
}

/* ==============================================
   UPDATE GROWTH
   ============================================== */
function updateGrowth(dt) {
  if (!state.blooming) return;
  growth = Math.min(1, growth + dt * 0.22);
  stem.scale.y = Math.max(0.05, growth);
  stem.position.y = 0.06 + growth * 0.64;
  bud.position.y = stem.position.y + stem.scale.y * 0.75;
  bud.visible = growth > 0.35;
  puff.position.y = bud.position.y;
  if (growth > 0.7) /** @type {THREE.MeshStandardMaterial} */ (bud.material).color.set("#ffe77a");
  if (growth >= 1) {
    state.blooming = false;
    state.puff = true;
    puff.visible = true;
    bud.visible = true;
    /** @type {THREE.MeshStandardMaterial} */ (bud.material).color.set("#ffffff");
    setStatus("Dandelion puff ready. Click the flower to disperse seeds.");
  }
}

/* ==============================================
   UPDATE SEEDS
   ============================================== */
function updateSeeds(dt, elapsed) {
  const gravity = 0.32, drag = 0.988, terminalFall = -0.55, landingY = 1.3;

  for (const seed of seeds) {
    if (!seed.active) continue;

    /* --- OUTBOUND ---*/
    if (seed.phase === 'outbound') {
      seed.phaseTimer += dt;

      seed.velocity.y += Math.sin(elapsed * 4.2 + seed.mesh.id * 0.9) * 0.10 * dt;
      seed.velocity.z += Math.sin(elapsed * 2.8 + seed.mesh.id * 0.5) * 0.05 * dt;
      seed.velocity.y -= 0.12 * dt;
      seed.velocity.multiplyScalar(0.998);
      seed.mesh.position.addScaledVector(seed.velocity, dt);
      seed.mesh.rotateOnAxis(seed.spinAxis, seed.spinSpeed * dt);

      const dist = seed.mesh.position.distanceTo(seed.startPos);
      const speed = seed.velocity.length();
      if (dist > 22 || seed.phaseTimer > 2.5 || speed < 0.8) {
        seed.phase = 'returning';
        seed.phaseTimer = 0;
        seed.returnProgress = 0;
        seed.peakPos.copy(seed.mesh.position);
        setStatus("The wind's direction is changing...");
      }
      continue;
    }

    /* --- RETURNING ---*/
    if (seed.phase === 'returning') {
      seed.returnProgress = Math.min(1, seed.returnProgress + dt * 0.30);
      const t = seed.returnProgress;
      const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

      const ctrl = new THREE.Vector3(
        (seed.peakPos.x + seed.startPos.x) * 0.5,
        Math.max(seed.peakPos.y, seed.startPos.y) + 8,
        (seed.peakPos.z + seed.startPos.z) * 0.5 + 3
      );

      const omt = 1 - eased;
      seed.mesh.position.set(
        omt * omt * seed.peakPos.x + 2 * omt * eased * ctrl.x + eased * eased * seed.startPos.x,
        omt * omt * seed.peakPos.y + 2 * omt * eased * ctrl.y + eased * eased * (seed.startPos.y + 0.05),
        omt * omt * seed.peakPos.z + 2 * omt * eased * ctrl.z + eased * eased * seed.startPos.z
      );

      seed.mesh.rotateOnAxis(seed.spinAxis, seed.spinSpeed * 0.28 * dt);

      if (Math.random() < dt * 5) {
        spawnWindRibbon(
          seed.mesh.position.clone().add(new THREE.Vector3(-0.6 + Math.random() * 0.3, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.5)),
          0.25
        );
      }

      if (seed.returnProgress >= 1) {
        seed.active = false;
        seed.landed = true;
        seed.phase = 'normal';
        followedSeed = null;
        scene.remove(seed.mesh);
        seeds.length = 0; // fully clear — next cycle starts fresh

        setTimeout(() => {
          resetCycle(true);
          setStatus("The seed found home!");
        }, 500);
      }
      continue;
    }

    /* --- NORMAL fall ---*/
    if (seed.landed) continue;

    seed.velocity.x += Math.sin(elapsed * 0.9 + seed.mesh.id * 0.17) * 0.08 * dt;
    seed.velocity.z += Math.cos(elapsed * 0.8 + seed.mesh.id * 0.13) * 0.08 * dt;
    seed.velocity.y -= gravity * dt;
    seed.velocity.multiplyScalar(drag);
    if (seed.velocity.y < terminalFall) seed.velocity.y = terminalFall;
    seed.mesh.position.addScaledVector(seed.velocity, dt);

    if (seed.mesh.position.y <= landingY) {
      seed.mesh.position.y = landingY;
      seed.velocity.set(0, 0, 0);
      seed.landed = true;
      seed.phase = 'normal';
    }
  }

  if (selectedSeed) {
    selectionRing.position.copy(selectedSeed.mesh.position);
    selectionRing.position.y += 0.05;
    selectionRing.scale.setScalar(0.85 + 0.15 * Math.sin(clock.elapsedTime * 6));
  }
}

/* ==============================================
   HELPERS
   ============================================== */
function averageCloudCenter(list) {
  const c = new THREE.Vector3();
  for (const cl of list) c.add(cl.position);
  return c.multiplyScalar(1 / list.length);
}

function cloudsReadyForRain() {
  const overR = 8, clusterD = 5.2;
  const center = averageCloudCenter(clouds);
  const dx = center.x - activeMound.position.x, dz = center.z - activeMound.position.z;
  if (Math.sqrt(dx * dx + dz * dz) >= overR) return false;
  for (const c of clouds) {
    const cdx = c.position.x - activeMound.position.x, cdz = c.position.z - activeMound.position.z;
    if (Math.sqrt(cdx * cdx + cdz * cdz) > overR + 1.2) return false;
  }
  for (let i = 0; i < clouds.length; i++)
    for (let j = i + 1; j < clouds.length; j++)
      if (clouds[i].position.distanceTo(clouds[j].position) > clusterD) return false;
  return true;
}

/* ==============================================
   CAMERA
   ============================================== */
function updateCamera() {
  if (followedSeed && followedSeed.phase === 'outbound') {
    const p = followedSeed.mesh.position;
    camera.position.lerp(p.clone().add(new THREE.Vector3(-7, 3.5, 5)), 0.048);
    camera.lookAt(p.clone().add(new THREE.Vector3(3, 0.5, 0)));
    return;
  }

  if (followedSeed && followedSeed.phase === 'returning') {
    const t = followedSeed.returnProgress;
    const m = activeMound.position;
    const s = followedSeed.mesh.position;
    const fx = THREE.MathUtils.lerp(s.x, m.x, t * 0.8);
    const fz = THREE.MathUtils.lerp(s.z, m.z, t * 0.8);
    camera.position.lerp(new THREE.Vector3(fx + 7.5, m.y + 5.5 + 3 * (1 - t), fz + 8), 0.028);
    camera.lookAt(new THREE.Vector3(fx, m.y + 5, fz));
    return;
  }

  const target = activeMound.position;
  camera.position.lerp(target.clone().add(new THREE.Vector3(7.5, 5.5, 8)), 0.022);
  camera.lookAt(target.clone().add(new THREE.Vector3(0, 5, 0)));
}

/* ==============================================
   RENDER LOOP
   ============================================== */
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.033);
  const elapsed = clock.elapsedTime;

  updateRain(dt, elapsed);
  updateGrowth(dt);
  updateSeeds(dt, elapsed);
  updateCloudsReturning(dt);

  const gustSeedPos = (followedSeed && (followedSeed.phase === 'outbound' || followedSeed.phase === 'returning'))
    ? followedSeed.mesh.position
    : null;
  updateWindVisuals(dt, elapsed, gustSeedPos);

  updateCamera();

  if (lightCone.visible) {
    const sunPos = new THREE.Vector3(2, 12, -8);
    const mp = activeMound.position;
    const mid = new THREE.Vector3((sunPos.x + mp.x) / 2, (sunPos.y + mp.y) / 2, (sunPos.z + mp.z) / 2);
    lightCone.position.copy(mid);
    lightCone.scale.y = (1.2 * sunPos.distanceTo(mp)) / 15;
    lightCone.lookAt(mp);
    lightCone.rotateX(-Math.PI / 2);
    if (state.puff) lightCone.visible = false;
  }

  if (state.planted && !state.watered && !rainActive && cloudsReadyForRain()) startRain(clouds);

  renderer.render(scene, camera);
}

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

resetCycle();
animate();
