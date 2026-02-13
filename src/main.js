import "./style.css";
import * as THREE from "three";

/* -----------------------------
   DOM
------------------------------ */
const canvas = /** @type {HTMLCanvasElement|null} */ (
  document.getElementById("three-canvas")
);
const statusEl = /** @type {HTMLElement|null} */ (document.getElementById("status"));
const rainButton = /** @type {HTMLButtonElement|null} */ (
  document.getElementById("rain-button")
);

if (!canvas) throw new Error("Missing <canvas id='three-canvas'>");
if (!statusEl) throw new Error("Missing #status element");
if (!rainButton) throw new Error("Missing #rain-button element");

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
  45,
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
sunLight.position.set(10, 18, 6);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.left = -25;
sunLight.shadow.camera.right = 25;
sunLight.shadow.camera.top = 25;
sunLight.shadow.camera.bottom = -25;
scene.add(sunLight);

/* -----------------------------
   GROUND / MOUNDS
------------------------------ */
const ground = new THREE.Mesh(
  new THREE.CircleGeometry(38, 96),
  new THREE.MeshStandardMaterial({
    color: "#668951",
    roughness: 0.95,
    metalness: 0,
  })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const soilMat = new THREE.MeshStandardMaterial({
  color: "#795641",
  roughness: 0.95,
});
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

  const mat = new THREE.MeshStandardMaterial({
    color: "#7bb05a",
    side: THREE.DoubleSide,
    roughness: 0.9,
  });

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.time = { value: 0 };
    shader.vertexShader = `uniform float time;\n${shader.vertexShader}`;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      float sway = sin(time * 1.7 + instanceMatrix[3][0] * 0.6 + instanceMatrix[3][2] * 0.4) * 0.12;
      transformed.x += sway * uv.y;
      transformed.z += sway * 0.25 * uv.y;`
    );
    // stash shader so we can update uniform later
    mat.userData.shader = shader;
  };

  const grass = new THREE.InstancedMesh(blade, mat, count);
  grass.castShadow = true;
  grass.receiveShadow = true;

  const dummy = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    const r = Math.sqrt(Math.random()) * 35;
    const a = Math.random() * Math.PI * 2;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;

    const exclusion = activeMound.position.distanceTo(
      new THREE.Vector3(x, activeMound.position.y, z)
    );

    if (exclusion < 2.6) {
      dummy.position.set(999, -999, 999); // effectively hidden
    } else {
      dummy.position.set(x, 0, z);
    }

    dummy.rotation.y = Math.random() * Math.PI;
    const s = 0.65 + Math.random() * 0.8;
    dummy.scale.setScalar(s);
    dummy.updateMatrix();
    grass.setMatrixAt(i, dummy.matrix);
  }

  scene.add(grass);
  return grass;
}

const grass = addGrass();

/* -----------------------------
   CLOUDS (SPRITES)
------------------------------ */
const cloudMat = new THREE.SpriteMaterial({
  color: "#f2f6fb",
  opacity: 0.92,
  transparent: true,
});

const cloudLeft = new THREE.Sprite(cloudMat.clone());
cloudLeft.scale.set(5.4, 2.8, 1);
cloudLeft.position.set(-5.8, 8.5, 0);
cloudLeft.userData.type = "cloud";

const cloudRight = new THREE.Sprite(cloudMat.clone());
cloudRight.scale.set(5.4, 2.8, 1);
cloudRight.position.set(5.8, 8.5, 0.8);
cloudRight.userData.type = "cloud";

scene.add(cloudLeft, cloudRight);

/* -----------------------------
   SUN
------------------------------ */
const sun = new THREE.Mesh(
  new THREE.SphereGeometry(0.9, 24, 24),
  new THREE.MeshStandardMaterial({
    color: "#ffe18a",
    emissive: "#f7c84f",
    emissiveIntensity: 1.6,
  })
);
sun.position.set(-10, 11, -10);
sun.userData.type = "sun";
scene.add(sun);

/* -----------------------------
   RAIN (POINTS)
------------------------------ */
const rainCount = 1700;
const rainPos = new Float32Array(rainCount * 3);
const rainVel = new Float32Array(rainCount);

for (let i = 0; i < rainCount; i++) {
  rainPos[i * 3] = (Math.random() - 0.5) * 4;
  rainPos[i * 3 + 1] = 4 + Math.random() * 7;
  rainPos[i * 3 + 2] = (Math.random() - 0.5) * 4;
  rainVel[i] = 6 + Math.random() * 8;
}

const rainGeo = new THREE.BufferGeometry();
rainGeo.setAttribute("position", new THREE.BufferAttribute(rainPos, 3));

const rainMat = new THREE.PointsMaterial({
  color: "#bddfff",
  size: 0.08,
  transparent: true,
  opacity: 0,
});
const rain = new THREE.Points(rainGeo, rainMat);
scene.add(rain);

/* -----------------------------
   PLANT (STEM/BUD/PUFF)
------------------------------ */
const stem = new THREE.Mesh(
  new THREE.CylinderGeometry(0.07, 0.1, 1.2, 16),
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
    new THREE.MeshStandardMaterial({
      color: "#f6f8ff",
      emissive: "#ffffff",
      emissiveIntensity: 0.1,
    })
  );

  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(2 * Math.random() - 1);
  const rad = 0.28 + Math.random() * 0.16;

  p.position.set(
    Math.sin(phi) * Math.cos(theta) * rad,
    Math.cos(phi) * rad,
    Math.sin(phi) * Math.sin(theta) * rad
  );
  puff.add(p);
}
puff.position.y = 1.9;
puff.visible = false;

const plant = new THREE.Group();
plant.add(stem, bud, puff);
plant.position.copy(activeMound.position);
plant.visible = false;
scene.add(plant);

/* -----------------------------
   SEEDS
------------------------------ */
/** @type {{mesh:THREE.Mesh, velocity:THREE.Vector3, active:boolean, landed:boolean}[]} */
const seeds = [];

const tmpV3 = new THREE.Vector3();
/** @type {THREE.Object3D|null} */
let dragging = null;

let growth = 0;
let rainActive = false;
let wetness = 0;
/** @type {{mesh:THREE.Mesh, velocity:THREE.Vector3, active:boolean, landed:boolean} | null} */
let followedSeed = null;

const state = {
  planted: false,
  watered: false,
  blooming: false,
  puff: false,
};

function setStatus(text) {
  statusEl.textContent = text;
}

function resetCycle(newMound) {
  state.planted = false;
  state.watered = false;
  state.blooming = false;
  state.puff = false;

  rainActive = false;
  wetness = 0;
  growth = 0;
  followedSeed = null;

  rainMat.opacity = 0;
  rainButton.disabled = false;

  if (newMound) activeMound = /** @type {THREE.Mesh} */ (newMound);

  plant.visible = false;
  puff.visible = false;
  bud.visible = false;

  stem.scale.y = 0.01;
  stem.position.y = 0.06;

  plant.position.copy(activeMound.position);
  setStatus("Click the mound to plant a seed.");
}

function startRain() {
  if (!state.planted || rainActive || state.watered) return;
  rainActive = true;
  rainButton.disabled = true;
  setStatus("Rain nourishes the mound. Now click the sun.");
}

rainButton.addEventListener("click", startRain);

function toNdc(event) {
  pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
}

/* -----------------------------
   INPUT
------------------------------ */
window.addEventListener("pointerdown", (event) => {
  toNdc(event);
  raycaster.setFromCamera(pointer, camera);

  // NOTE: include bud so click works (bud isn't in the list otherwise).
  const hits = raycaster.intersectObjects(
    [activeMound, sun, cloudLeft, cloudRight, bud, ...seeds.map((s) => s.mesh)],
    true
  );

  if (!hits.length) return;

  const target = hits[0].object;

  if (target.userData.type === "cloud") {
    dragging = target;
    return;
  }

  if (target === activeMound && !state.planted) {
    state.planted = true;
    plant.visible = true;
    stem.scale.y = 0.01;
    stem.position.y = 0.06;
    bud.visible = false;
    setStatus("Great. Make it rain (button or drag clouds together).");
    return;
  }

  if (target === sun && state.watered && !state.puff) {
    state.blooming = true;
    setStatus("Sunlight helps it grow. Wait for bloom...");
    return;
  }

  const pickedSeed = seeds.find((s) => s.mesh === target);
  if (pickedSeed) {
    followedSeed = pickedSeed;
    setStatus("Following seed... it will start a new cycle where it lands.");
    return;
  }

  if (target === bud && state.puff) {
    disperseSeeds();
  }
});

window.addEventListener("pointerup", () => {
  dragging = null;
});

window.addEventListener("pointermove", (event) => {
  if (!dragging) return;

  toNdc(event);
  raycaster.setFromCamera(pointer, camera);

  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -8.5);
  if (raycaster.ray.intersectPlane(plane, tmpV3)) {
    dragging.position.x = THREE.MathUtils.clamp(tmpV3.x, -10, 10);
    dragging.position.z = THREE.MathUtils.clamp(tmpV3.z, -3, 3);
  }

  if (cloudLeft.position.distanceTo(cloudRight.position) < 2.5) {
    startRain();
  }
});

/* -----------------------------
   LOGIC
------------------------------ */
function disperseSeeds() {
  if (!state.puff) return;

  state.puff = false;
  puff.visible = false;
  bud.visible = false;

  for (let i = 0; i < 36; i++) {
    const seed = new THREE.Mesh(
      new THREE.SphereGeometry(0.055, 10, 10),
      new THREE.MeshStandardMaterial({ color: "#f6f8ff" })
    );
    seed.castShadow = true;
    seed.userData.type = "seed";
    seed.position.copy(plant.position).add(new THREE.Vector3(0, 1.8, 0));
    scene.add(seed);

    const vel = new THREE.Vector3(
      (Math.random() - 0.5) * 1.1,
      1.4 + Math.random() * 1.7,
      (Math.random() - 0.5) * 1.1
    ).add(windDirection.clone().multiplyScalar(0.7 + Math.random() * 0.6));

    seeds.push({ mesh: seed, velocity: vel, active: true, landed: false });
  }

  setStatus("Seeds dispersed! Click a seed to follow it.");
}

function updateRain(dt, elapsed) {
  if (rainActive) {
    wetness = Math.min(1, wetness + dt * 0.25);
    rainMat.opacity = Math.min(0.9, wetness);
  } else {
    rainMat.opacity = Math.max(0, rainMat.opacity - dt * 0.8);
  }

  if (wetness >= 1 && !state.watered) {
    state.watered = true;
    rainActive = false;
    setStatus("Now click the sun to trigger growth.");
  }

  const positions = /** @type {Float32Array} */ (rain.geometry.attributes.position.array);
  for (let i = 0; i < rainCount; i++) {
    positions[i * 3] =
      activeMound.position.x +
      (Math.random() - 0.5) * 3.2 +
      windDirection.x * Math.sin(elapsed + i) * 0.03;

    positions[i * 3 + 1] -= rainVel[i] * dt;

    positions[i * 3 + 2] =
      activeMound.position.z +
      (Math.random() - 0.5) * 3.2 +
      windDirection.z * Math.cos(elapsed + i * 0.4) * 0.03;

    if (positions[i * 3 + 1] < 0.6) {
      positions[i * 3 + 1] = 6 + Math.random() * 5;
    }
  }
  rain.geometry.attributes.position.needsUpdate = true;

  const dryColor = new THREE.Color("#795641");
  const wetColor = new THREE.Color("#50392b");

  const moundMat = /** @type {THREE.MeshStandardMaterial} */ (activeMound.material);
  moundMat.color.copy(dryColor.clone().lerp(wetColor, wetness));
  moundMat.roughness = THREE.MathUtils.lerp(0.95, 0.35, wetness);
}

function updateGrowth(dt) {
  if (!state.blooming) return;

  growth = Math.min(1, growth + dt * 0.22);

  stem.scale.y = Math.max(0.05, growth);
  stem.position.y = 0.06 + growth * 0.64;
  bud.visible = growth > 0.35;

  if (growth > 0.7) {
    /** @type {THREE.MeshStandardMaterial} */ (bud.material).color.set("#ffe77a");
  }

  if (growth >= 1) {
    state.blooming = false;
    state.puff = true;
    puff.visible = true;
    bud.visible = true;
    /** @type {THREE.MeshStandardMaterial} */ (bud.material).color.set("#ffffff");
    setStatus("Dandelion puff ready. Click the flower to disperse seeds.");
  }
}

function updateSeeds(dt, elapsed) {
  for (const seed of seeds) {
    if (!seed.active) continue;
    if (seed.landed) continue;

    seed.velocity.addScaledVector(
      windDirection,
      dt * (0.2 + Math.sin(elapsed + seed.mesh.id) * 0.2)
    );
    seed.velocity.y -= 1.2 * dt;
    seed.mesh.position.addScaledVector(seed.velocity, dt);

    if (seed.mesh.position.y <= 0.45) {
      seed.mesh.position.y = 0.45;
      seed.velocity.set(0, 0, 0);
      seed.landed = true;

      if (followedSeed === seed) {
        const newMound = addMound(
          new THREE.Vector3(seed.mesh.position.x, 0.45, seed.mesh.position.z)
        );
        resetCycle(newMound);
        setStatus("A new mound formed. Click it to plant again.");
      }
    }
  }
}

/* -----------------------------
   LOOP
------------------------------ */
function animate() {
  requestAnimationFrame(animate);

  const dt = Math.min(clock.getDelta(), 0.033);
  const elapsed = clock.elapsedTime;

  const grassShader = grass.material.userData.shader;
  if (grassShader) grassShader.uniforms.time.value = elapsed;

  cloudLeft.position.x += Math.sin(elapsed * 0.25) * 0.002;
  cloudRight.position.x -= Math.sin(elapsed * 0.22) * 0.002;

  updateRain(dt, elapsed);
  updateGrowth(dt);
  updateSeeds(dt, elapsed);

  const target = (followedSeed && followedSeed.mesh.position) || activeMound.position;
  const cameraTarget = target.clone().add(new THREE.Vector3(7.5, 5.5, 8));
  camera.position.lerp(cameraTarget, 0.02);
  camera.lookAt(target.clone().add(new THREE.Vector3(0, 1.4, 0)));

  renderer.render(scene, camera);
}

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

resetCycle();
animate();
