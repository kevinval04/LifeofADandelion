import * as THREE from "three";
import "./style.css";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

/* -----------------------------
   BASIC CONFIG / STATE MACHINE
------------------------------ */
const GameState = Object.freeze({
  Explore: "Explore",
  SeedPlanted: "SeedPlanted",
  Watering: "Watering",
  SunGrowth: "SunGrowth",
  Bloomed: "Bloomed",
  PuffReady: "PuffReady",
  Dispersing: "Dispersing",
  SeedSelected: "SeedSelected",
  SeedLanding: "SeedLanding",
});

let state = GameState.Explore;

/* -----------------------------
   SCENE / CAMERA / RENDERER
------------------------------ */
const scene = new THREE.Scene();

// Subtle atmospheric depth
scene.fog = new THREE.Fog(0xcfe9ff, 25, 160);

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  800
);
camera.position.set(10, 9, 14);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

document.body.appendChild(renderer.domElement);

/* -----------------------------
   CAMERA CONTROLS
------------------------------ */
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.2, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 4;
controls.maxDistance = 60;
controls.maxPolarAngle = Math.PI * 0.49;

/* -----------------------------
   SKY
------------------------------ */
function makeSkyDome() {
  const geo = new THREE.SphereGeometry(400, 48, 24);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {
      topColor: { value: new THREE.Color(0x66b7ff) },
      bottomColor: { value: new THREE.Color(0xeaf7ff) },
      offset: { value: 30.0 },
      exponent: { value: 0.7 },
    },
    vertexShader: `
      varying vec3 vWorldPosition;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPosition = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 bottomColor;
      uniform float offset;
      uniform float exponent;
      varying vec3 vWorldPosition;
      void main() {
        float h = normalize(vWorldPosition + vec3(0.0, offset, 0.0)).y;
        float t = pow(max(h, 0.0), exponent);
        gl_FragColor = vec4(mix(bottomColor, topColor, t), 1.0);
      }
    `,
  });
  const sky = new THREE.Mesh(geo, mat);
  sky.name = "sky";
  return sky;
}
scene.add(makeSkyDome());

/* -----------------------------
   LIGHTING
------------------------------ */
const ambient = new THREE.AmbientLight(0xffffff, 0.25);
scene.add(ambient);

const sunLight = new THREE.DirectionalLight(0xfff2d6, 1.2);
sunLight.position.set(30, 40, 15);
sunLight.castShadow = true;

sunLight.shadow.mapSize.width = 2048;
sunLight.shadow.mapSize.height = 2048;
sunLight.shadow.camera.near = 5;
sunLight.shadow.camera.far = 140;
sunLight.shadow.camera.left = -60;
sunLight.shadow.camera.right = 60;
sunLight.shadow.camera.top = 60;
sunLight.shadow.camera.bottom = -60;
sunLight.shadow.bias = -0.00025;

scene.add(sunLight);

const fillLight = new THREE.DirectionalLight(0xd6ecff, 0.25);
fillLight.position.set(-20, 25, -30);
scene.add(fillLight);

const sunGeo = new THREE.SphereGeometry(1.1, 32, 16);
const sunMat = new THREE.MeshStandardMaterial({
  color: 0xfff6a3,
  emissive: 0xffc85a,
  emissiveIntensity: 0.8,
  roughness: 0.7,
});
const sun = new THREE.Mesh(sunGeo, sunMat);
sun.position.set(-35, 35, -85);
sun.name = "sun";
scene.add(sun);

/* -----------------------------
   TERRAIN
------------------------------ */
function hash2(x, z) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

function terrainHeight(x, z) {
  const big =
    Math.sin(x * 0.03) * 2.2 +
    Math.cos(z * 0.028) * 1.8 +
    Math.sin((x + z) * 0.018) * 1.4;

  const mid =
    Math.sin(x * 0.12 + z * 0.06) * 0.5 +
    Math.cos(z * 0.11 - x * 0.04) * 0.45;

  const tiny = (hash2(x * 0.6, z * 0.6) - 0.5) * 0.15;

  return big * 0.25 + mid * 0.22 + tiny;
}

const groundGeo = new THREE.PlaneGeometry(220, 220, 220, 220);
groundGeo.rotateX(-Math.PI / 2);

const colors = [];
for (let i = 0; i < groundGeo.attributes.position.count; i++) {
  const x = groundGeo.attributes.position.getX(i);
  const z = groundGeo.attributes.position.getZ(i);

  const y = terrainHeight(x, z);
  groundGeo.attributes.position.setY(i, y);

  const n = hash2(x * 0.25, z * 0.25);
  const base = new THREE.Color(0x2f8f3f);
  const dark = new THREE.Color(0x246a2f);
  const light = new THREE.Color(0x49b65a);

  let c = base.clone().lerp(dark, n * 0.5);
  c = c.lerp(light, (1 - n) * 0.18);

  colors.push(c.r, c.g, c.b);
}
groundGeo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
groundGeo.computeVertexNormals();

const groundMat = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.95,
  metalness: 0.0,
});

const ground = new THREE.Mesh(groundGeo, groundMat);
ground.name = "ground";
ground.receiveShadow = true;
scene.add(ground);


/* -----------------------------
   MOUND (3D mound only — NO FLAT PATCH)
------------------------------ */
function smoothstep(edge0, edge1, x) {
  const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function makeMound({
  center = new THREE.Vector3(0, 0, 0),
  radius = 3.2,
  height = 1.2,
  segments = 64,
} = {}) {
  // Create a 2D profile curve (r,y) and revolve around Y.
  // Wide base, smooth slope, rounded top.
  const pts = [];
  const steps = 36;

  for (let i = 0; i <= steps; i++) {
    const t = i / steps; // 0..1
    const r = radius * Math.pow(1.0 - t, 0.72); // base -> taper
    const y = height * Math.pow(t, 1.20);       // smooth rise
    pts.push(new THREE.Vector2(r, y));
  }
  pts.push(new THREE.Vector2(0.001, height)); // tiny cap

  const geo = new THREE.LatheGeometry(pts, segments);
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    color: 0x6a4a3c,
    roughness: 0.98,
    metalness: 0.0,
  });

  const mound = new THREE.Mesh(geo, mat);
  mound.name = "mound";
  mound.castShadow = true;
  mound.receiveShadow = true;

  // Place the mound so its base sits on the terrain height at the center
  mound.position.set(center.x, center.y, center.z);

  // store radius for grass exclusion
  mound.userData.radius = radius;

  return mound;
}

const MOUND_POS = new THREE.Vector3(0, terrainHeight(0, 0), 0);

const mound = makeMound({
  center: MOUND_POS,
  radius: 3.2,
  height: 1.2,
  segments: 64,
});
scene.add(mound);


/* -----------------------------
   GRASS BLADES (InstancedMesh)
------------------------------ */
function makeGrassMaterial() {
  const mat = new THREE.MeshStandardMaterial({
    color: 0x2e9b45,
    roughness: 1.0,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0.0 };

    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
         uniform float uTime;`
      )
      .replace(
        "#include <begin_vertex>",
        `
        #include <begin_vertex>

        float bladeFactor = clamp(transformed.y, 0.0, 1.0);
        float w = sin(uTime * 1.6 + position.x * 7.1 + position.y * 3.7 + position.z * 5.9);

        transformed.x += w * 0.06 * bladeFactor;
        transformed.z += w * 0.04 * bladeFactor;
        `
      );

    mat.userData.shader = shader;
  };

  return mat;
}

function createGrassField({
  count = 35000,
  radius = 70,

  moundCenter = new THREE.Vector3(0, 0, 0),
  moundRadius = 3.2,      // should match mound.userData.radius
  noGrassPad = 0.6,       // extra buffer beyond mound radius (tune)
  thinOuter = 10.0,       // distance where density returns to 1
  minKeep = 0.12,         // density just outside exclusion zone
} = {}) {
  const bladeH = 0.9;
  const bladeW = 0.06;
  const bladeGeo = new THREE.PlaneGeometry(bladeW, bladeH, 1, 4);
  bladeGeo.translate(0, bladeH / 2, 0);

  const bladeMat = makeGrassMaterial();
  const inst = new THREE.InstancedMesh(bladeGeo, bladeMat, count);
  inst.name = "grass";
  inst.castShadow = true;
  inst.receiveShadow = true;

  const dummy = new THREE.Object3D();
  let kept = 0;

  const noGrassRadius = moundRadius + noGrassPad;

  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const rr = Math.sqrt(Math.random()) * radius;
    const x = Math.cos(a) * rr;
    const z = Math.sin(a) * rr;

    const dx = x - moundCenter.x;
    const dz = z - moundCenter.z;
    const d = Math.sqrt(dx * dx + dz * dz);

    // HARD “no grass” zone
    if (d < noGrassRadius) continue;

    // Soft ramp back to full density
    const t = smoothstep(noGrassRadius, thinOuter, d);
    const keepProb = THREE.MathUtils.lerp(minKeep, 1.0, t);
    if (Math.random() > keepProb) continue;

    const y = terrainHeight(x, z);

    const yaw = Math.random() * Math.PI * 2;
    const tilt = (Math.random() - 0.5) * 0.15;
    const s = 0.6 + Math.random() * 0.65;

    dummy.position.set(x, y, z);
    dummy.rotation.set(tilt, yaw, 0);
    dummy.scale.setScalar(s);
    dummy.updateMatrix();

    inst.setMatrixAt(kept, dummy.matrix);
    kept++;
  }

  inst.count = kept; // IMPORTANT: only draw what we placed
  inst.instanceMatrix.needsUpdate = true;

  scene.add(inst);
  return inst;
}


const grass = createGrassField({
  count: 35000,
  radius: 70,
  moundCenter: MOUND_POS,
  moundRadius: mound.userData.radius,
  noGrassPad: 0.6,
  thinOuter: 7.0,
  minKeep: 0.10,
});

/* -----------------------------
   CLOUDS
------------------------------ */
function makeCloud() {
  const group = new THREE.Group();
  const puffMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 1.0,
    metalness: 0.0,
  });

  const puffs = [
    { r: 1.2, x: 0.0, y: 0.0, z: 0.0 },
    { r: 1.0, x: 1.2, y: 0.2, z: 0.0 },
    { r: 1.0, x: -1.2, y: 0.2, z: 0.0 },
    { r: 0.95, x: 0.2, y: 0.45, z: 0.9 },
    { r: 0.95, x: -0.2, y: 0.45, z: -0.9 },
  ];

  for (const p of puffs) {
    const g = new THREE.SphereGeometry(p.r, 18, 14);
    const m = new THREE.Mesh(g, puffMat);
    m.position.set(p.x, p.y, p.z);
    m.castShadow = true;
    group.add(m);
  }

  group.name = "cloud";
  return group;
}

const clouds = [];
for (let i = 0; i < 3; i++) {
  const c = makeCloud();
  c.position.set(12 + i * 10, 18 + (i % 2) * 1.0, -40 + i * 5);
  scene.add(c);
  clouds.push(c);
}

/* -----------------------------
   RAYCASTING + INPUT
------------------------------ */
const raycaster = new THREE.Raycaster();
const mouseNDC = new THREE.Vector2();
let isMouseDown = false;

let draggedCloud = null;
const CLOUD_Y = 18.0;
const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -CLOUD_Y);

function setMouseFromEvent(e) {
  const rect = renderer.domElement.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  const y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
  mouseNDC.set(x, y);
}

function intersectObjects(objList) {
  raycaster.setFromCamera(mouseNDC, camera);
  return raycaster.intersectObjects(objList, true);
}

function getRootNamed(obj, name) {
  let cur = obj;
  while (cur) {
    if (cur.name === name) return cur;
    cur = cur.parent;
  }
  return null;
}

let plantedSeed = null;

function plantSeedAt(point) {
  if (plantedSeed) {
    scene.remove(plantedSeed);
    plantedSeed = null;
  }

  const seedGeo = new THREE.SphereGeometry(0.14, 18, 14);
  const seedMat = new THREE.MeshStandardMaterial({
    color: 0x5d4037,
    roughness: 1.0,
  });

  plantedSeed = new THREE.Mesh(seedGeo, seedMat);
  const y = terrainHeight(point.x, point.z);
  plantedSeed.position.set(point.x, y + 0.18, point.z);
  plantedSeed.castShadow = true;
  plantedSeed.name = "seed";
  scene.add(plantedSeed);

  state = GameState.SeedPlanted;
  console.log("State:", state);
}

window.addEventListener("pointerdown", (e) => {
  isMouseDown = true;
  setMouseFromEvent(e);

  // Cloud drag
  const cloudHits = intersectObjects(clouds);
  if (cloudHits.length > 0) {
    const rootCloud = getRootNamed(cloudHits[0].object, "cloud");
    if (rootCloud) {
      draggedCloud = rootCloud;
      return;
    }
  }

  // Mound click -> plant
  const moundHits = intersectObjects([mound]);
  if (moundHits.length > 0 && state === GameState.Explore) {
    plantSeedAt(moundHits[0].point);
    return;
  }

  // Sun click
  const sunHits = intersectObjects([sun]);
  if (sunHits.length > 0) {
    console.log("Clicked sun");
    return;
  }
});

window.addEventListener("pointermove", (e) => {
  setMouseFromEvent(e);

  if (isMouseDown && draggedCloud) {
    raycaster.setFromCamera(mouseNDC, camera);
    const hitPoint = new THREE.Vector3();
    raycaster.ray.intersectPlane(dragPlane, hitPoint);
    draggedCloud.position.x = hitPoint.x;
    draggedCloud.position.z = hitPoint.z;
  }
});

window.addEventListener("pointerup", () => {
  isMouseDown = false;
  draggedCloud = null;
});

/* -----------------------------
   RESIZE
------------------------------ */
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* -----------------------------
   ANIMATION LOOP
------------------------------ */
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const t = clock.getElapsedTime();

  if (grass.material.userData.shader) {
    grass.material.userData.shader.uniforms.uTime.value = t;
  }

  for (let i = 0; i < clouds.length; i++) {
    if (clouds[i] === draggedCloud) continue;
    clouds[i].position.x += Math.sin(t * 0.12 + i * 1.7) * 0.01;
    clouds[i].position.z += Math.cos(t * 0.10 + i * 1.3) * 0.01;
  }

  controls.update();
  renderer.render(scene, camera);
}

animate();
