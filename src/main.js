import "./style.css";
import * as THREE from "three";

//DOM
const canvas = /** @type {HTMLCanvasElement|null} */ (
  document.getElementById("three-canvas")
);
const statusEl = /** @type {HTMLElement|null} */ (document.getElementById("status"));

//RENDERER / SCENE / CAMERA
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

//Lighting
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

// Mound
const ground = new THREE.Mesh(
  new THREE.CircleGeometry(50, 96),
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

// Grass
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
      float phaseOffset = instanceMatrix[3][0] * 0.6 + instanceMatrix[3][2] * 0.4;
      float baseSway = sin(time * 1.7 + phaseOffset) * 0.12;
      float gustSway = sin(time * 4.0 + instanceMatrix[3][0] * 1.2) * windStrength * 0.45;
      float sway = (baseSway + gustSway) * smoothstep(0.0, 0.3, uv.y);
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
    const r = Math.sqrt(Math.random()) * 47;
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

// Clouds
function createFluffyCloud() {
  const cloudGroup = new THREE.Group();
  for (let i = 0; i < 15; i++) {
    const radius = 0.8 + Math.random() * 0.6;
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 12, 12),
      new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 1 })
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
const cloudHomePositions = [];

for (let i = 0; i < 3; i++) {
  const cloud = createFluffyCloud();
  const homePos = new THREE.Vector3(-10 + i * 8, 11 + (i % 2), -4 + (i % 2));
  cloud.position.copy(homePos);
  cloudHomePositions.push(homePos.clone());
  scene.add(cloud);
  clouds.push(cloud);
}

let cloudsReturning = false;

function updateCloudsReturning(dt) {
  if (!cloudsReturning) return;
  let allHome = true;
  for (let i = 0; i < clouds.length; i++) {
    clouds[i].position.lerp(cloudHomePositions[i], dt * 1.4);
    if (clouds[i].position.distanceTo(cloudHomePositions[i]) > 0.05) allHome = false;
  }
  if (allHome) {
    for (let i = 0; i < clouds.length; i++) clouds[i].position.copy(cloudHomePositions[i]);
    cloudsReturning = false;
  }
}

// Sun
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

//Rays from sun on click
const lightCone = new THREE.Mesh(
  new THREE.ConeGeometry(2, 15, 32, 1, true),
  new THREE.MeshBasicMaterial({ color: "#fff4d6", transparent: true, opacity: 0.2, side: THREE.DoubleSide })
);
lightCone.visible = false;
scene.add(lightCone);

// Rain
const rainCount = 1200;
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
  rainPos[i * 6] = x;
  rainPos[i * 6 + 1] = y;
  rainPos[i * 6 + 2] = z;
  rainPos[i * 6 + 3] = x;
  rainPos[i * 6 + 4] = y - len;
  rainPos[i * 6 + 5] = z;
}
const rainGeo = new THREE.BufferGeometry();
rainGeo.setAttribute("position", new THREE.BufferAttribute(rainPos, 3));
const rainMat = new THREE.LineBasicMaterial({ color: "#c8e8ff", transparent: true, opacity: 0 });
const rain = new THREE.LineSegments(rainGeo, rainMat);

// different seasons system

// Spring flowers
const springFlowers = ['#f4a0c0', '#c090e8', '#ffe060'].map(color => {
  const fm = new THREE.InstancedMesh(
    new THREE.CircleGeometry(0.12, 6),
    new THREE.MeshStandardMaterial({ color, roughness: 0.9, side: THREE.DoubleSide }),
    280
  );
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 280; i++) {
    const r = 3.5 + Math.sqrt(Math.random()) * 30;
    const a = Math.random() * Math.PI * 2;
    dummy.position.set(Math.cos(a) * r, 0.05, Math.sin(a) * r);
    dummy.rotation.x = -Math.PI / 2;
    dummy.rotation.z = Math.random() * Math.PI;
    dummy.scale.setScalar(0.5 + Math.random() * 0.9);
    dummy.updateMatrix();
    fm.setMatrixAt(i, dummy.matrix);
  }
  fm.visible = false;
  scene.add(fm);
  return fm;
});

// Spring bees (speed and circular path they follow)
const BEE_COUNT = 16;
const beeData = Array.from({ length: BEE_COUNT }, () => ({
  cx: (Math.random() - 0.5) * 12,
  cz: (Math.random() - 0.5) * 12,
  cy: 1.4 + Math.random() * 2.5,
  angle: Math.random() * Math.PI * 2,
  radius: 0.7 + Math.random() * 1.6,
  speed: 1.5 + Math.random() * 2.0,
  bobPhase: Math.random() * Math.PI * 2,
}));
const beeGroup = new THREE.Group();
beeGroup.visible = false;
/** @type {THREE.Group[]} */
const beeMeshes = [];
for (let i = 0; i < BEE_COUNT; i++) {
  const bee = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(0.08, 8, 6),
    new THREE.MeshStandardMaterial({ color: '#f8d020', roughness: 0.7 })
  );
  bee.add(body);
  const stripe1 = new THREE.Mesh(
    new THREE.CylinderGeometry(0.083, 0.083, 0.025, 8),
    new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.8 })
  );
  stripe1.rotation.x = Math.PI / 2;
  stripe1.position.z = 0.02;
  bee.add(stripe1);
  const stripe2 = stripe1.clone();
  stripe2.position.z = -0.025;
  bee.add(stripe2);
  const wingMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.5, side: THREE.DoubleSide });
  const wingGeo = new THREE.CircleGeometry(0.05, 6);
  const wingL = new THREE.Mesh(wingGeo, wingMat);
  wingL.position.set(0.06, 0.04, 0);
  wingL.rotation.x = -0.3;
  bee.add(wingL);
  const wingR = new THREE.Mesh(wingGeo, wingMat);
  wingR.position.set(-0.06, 0.04, 0);
  wingR.rotation.x = -0.3;
  bee.add(wingR);
  bee.userData.wingL = wingL;
  bee.userData.wingR = wingR;
  beeGroup.add(bee);
  beeMeshes.push(bee);
}
scene.add(beeGroup);

// Winter ambient snowfall
const SNOW_COUNT = 700;
const snowAmbientPos = new Float32Array(SNOW_COUNT * 3);
const snowAmbientVel = new Float32Array(SNOW_COUNT);
for (let i = 0; i < SNOW_COUNT; i++) {
  snowAmbientPos[i * 3] = (Math.random() - 0.5) * 55;
  snowAmbientPos[i * 3 + 1] = Math.random() * 16;
  snowAmbientPos[i * 3 + 2] = (Math.random() - 0.5) * 55;
  snowAmbientVel[i] = 0.35 + Math.random() * 0.7;
}
const snowAmbientGeo = new THREE.BufferGeometry();
snowAmbientGeo.setAttribute('position', new THREE.BufferAttribute(snowAmbientPos, 3));
const snowAmbientMat = new THREE.PointsMaterial({ color: '#eef4ff', size: 0.11, transparent: true, opacity: 0 });
const ambientSnow = new THREE.Points(snowAmbientGeo, snowAmbientMat);
scene.add(ambientSnow);

/** @type {THREE.Mesh[][]} */
const treeLeafMeshes = [];
/** @type {THREE.MeshStandardMaterial[]} */
const treeLeafMats = [];

const SEASONS = [
  { name: 'Summer', sky: '#b9d2df', fog: '#b9d2df', hemiSky: '#dff6ff', hemiGround: '#5f7f55', sunColor: '#fff4d6', groundColor: '#668951', grassColor: '#7bb05a', treeLeaf: '#72b840' },
  { name: 'Fall', sky: '#c4a882', fog: '#b8a07a', hemiSky: '#e8cfa0', hemiGround: '#6b5030', sunColor: '#ffe0a8', groundColor: '#8a7858', grassColor: '#b09040', treeLeaf: '#c86828' },
  { name: 'Winter', sky: '#b4c8d8', fog: '#ccd8e4', hemiSky: '#e0eeff', hemiGround: '#b8c8d4', sunColor: '#d8e8ff', groundColor: '#ccd4d8', grassColor: '#b8c8d0', treeLeaf: null },
  { name: 'Spring', sky: '#a8cce0', fog: '#b4d8e4', hemiSky: '#c8f0d0', hemiGround: '#4a7c30', sunColor: '#fff8e0', groundColor: '#5a8a38', grassColor: '#66ae3e', treeLeaf: '#f4a8c0' },
];
let seasonIndex = 0;

function applySeasonTheme(idx) {
  const s = SEASONS[idx];
  /** @type {THREE.Color} */ (scene.background).set(s.sky);
  scene.fog.color.set(s.fog);
  hemi.color.set(s.hemiSky);
  hemi.groundColor.set(s.hemiGround);
  sunLight.color.set(s.sunColor);
  /** @type {THREE.MeshStandardMaterial} */ (ground.material).color.set(s.groundColor);
  /** @type {THREE.MeshStandardMaterial} */ (grass.material).color.set(s.grassColor);

  const isSpring = idx === 3;
  const isWinter = idx === 2;
  for (const f of springFlowers) f.visible = isSpring;
  beeGroup.visible = isSpring;
  snowAmbientMat.opacity = isWinter ? 0.75 : 0;

  for (let t = 0; t < treeLeafMats.length; t++) {
    if (s.treeLeaf === null) {
      for (const m of treeLeafMeshes[t]) m.visible = false;
    } else {
      for (const m of treeLeafMeshes[t]) m.visible = true;
      treeLeafMats[t].color.set(s.treeLeaf);
    }
  }
  updateAudioForSeason(idx);
}

function updateSeasonalExtras(dt, elapsed) {
  //striped mesh bees in the sprijg
  if (beeGroup.visible) {
    for (let i = 0; i < BEE_COUNT; i++) {
      const d = beeData[i];
      const bee = beeMeshes[i];
      d.angle += d.speed * dt;
      bee.position.set(
        d.cx + Math.cos(d.angle) * d.radius,
        d.cy + Math.sin(elapsed * 2.2 + d.bobPhase) * 0.28,
        d.cz + Math.sin(d.angle) * d.radius
      );
      bee.rotation.y = d.angle + Math.PI / 2;
      const flap = Math.sin(elapsed * 35 + i * 2.0) * 0.6;
      bee.userData.wingL.rotation.z = flap;
      bee.userData.wingR.rotation.z = -flap;
    }
  }

  // Ambient snow (winter)
  if (snowAmbientMat.opacity > 0) {
    const sp = snowAmbientGeo.attributes.position.array;
    for (let i = 0; i < SNOW_COUNT; i++) {
      sp[i * 3] += Math.sin(elapsed * 0.5 + i * 0.31) * 0.009;
      sp[i * 3 + 1] -= snowAmbientVel[i] * dt;
      sp[i * 3 + 2] += Math.cos(elapsed * 0.4 + i * 0.27) * 0.007;
      if (sp[i * 3 + 1] < 0) {
        sp[i * 3] = (Math.random() - 0.5) * 55;
        sp[i * 3 + 1] = 16 + Math.random() * 3;
        sp[i * 3 + 2] = (Math.random() - 0.5) * 55;
      }
    }
    snowAmbientGeo.attributes.position.needsUpdate = true;
  }
}



/* -----------------------------
   AUDIO SYSTEM
------------------------------ */
let audioCtx = null;
let audioInitialized = false;
let masterGainNode = null;
let windGainNode = null;
let windFilterNode = null;
let rainGainNode = null;
let birdTimer = null;

// Ambient layer nodes
let beeGainNode = null;
let iceBellTimer = null;
let iceBellGainNode = null;

// Music sequencer state
let musicSchedulerTimer = null;
let musicMelodyIdx = 0;
let musicBassIdx = 0;
let musicNextTime = 0;
let currentSeasonMusicIdx = -1;
let musicMelodyGain = null;
let musicBassGain = null;

const NOTE = {
  C3:130.81, D3:146.83, E3:164.81, F3:174.61, G3:196.00, A3:220.00, B3:246.94,
  C4:261.63, D4:293.66, E4:329.63, F4:349.23, G4:392.00, A4:440.00, B4:493.88,
  C5:523.25, D5:587.33, E5:659.25, G5:783.99, A5:880.00,
};

const SEASON_MUSIC = [
  {
    melodyNotes: [NOTE.E4, NOTE.G4, NOTE.A4, NOTE.G4, NOTE.E4, NOTE.C4, NOTE.D4, NOTE.E4],
    melodyDurs:  [0.40,   0.40,   0.60,   0.40,   0.40,   0.80,   0.40,   0.80],
    bassNotes:   [NOTE.C3, NOTE.G3, NOTE.F3, NOTE.G3],
    bassDurs:    [1.00,    1.00,    1.00,    1.00],
    melodyWave: 'sine', bassWave: 'sine',
    melodyGain: 0.095, bassGain: 0.060,
  },
  {
    melodyNotes: [NOTE.A4, NOTE.G4, NOTE.F4, NOTE.E4, NOTE.D4, NOTE.C4, NOTE.D4, NOTE.E4],
    melodyDurs:  [0.50,   0.50,   0.50,   0.70,   0.50,   0.50,   0.50,   0.80],
    bassNotes:   [NOTE.A3, NOTE.E3, NOTE.F3, NOTE.E3],
    bassDurs:    [1.20,    1.20,    1.20,    1.20],
    melodyWave: 'sine', bassWave: 'sine',
    melodyGain: 0.085, bassGain: 0.055,
  },
  {
    melodyNotes: [NOTE.D4, 0, NOTE.F4, 0, NOTE.A4, 0, NOTE.G4, NOTE.F4],
    melodyDurs:  [0.80, 0.80, 0.80, 0.80, 0.80, 0.80, 0.80, 0.80],
    bassNotes:   [NOTE.D3, 0, NOTE.A3, 0],
    bassDurs:    [2.00,  2.00, 2.00, 2.00],
    melodyWave: 'sine', bassWave: 'sine',
    melodyGain: 0.075, bassGain: 0.050,
  },
  {
    melodyNotes: [NOTE.G4, NOTE.A4, NOTE.B4, NOTE.A4, NOTE.G4, NOTE.E4, NOTE.D4, NOTE.G4],
    melodyDurs:  [0.30,   0.30,   0.45,   0.30,   0.30,   0.60,   0.30,   0.60],
    bassNotes:   [NOTE.G3, NOTE.D3, NOTE.C3, NOTE.D3],
    bassDurs:    [0.90,    0.90,    0.90,    0.90],
    melodyWave: 'sine', bassWave: 'sine',
    melodyGain: 0.090, bassGain: 0.058,
  },
];

function initAudio() {
  if (audioInitialized) return;
  audioInitialized = true;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();

  masterGainNode = audioCtx.createGain();
  masterGainNode.gain.value = 0.28;
  masterGainNode.connect(audioCtx.destination);

  function makeNoiseBuf(sec = 3) {
    const buf = audioCtx.createBuffer(2, Math.ceil(audioCtx.sampleRate * sec), audioCtx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      let last = 0;
      for (let i = 0; i < d.length; i++) {
        last = (last + (Math.random() * 2 - 1) * 0.08) * 0.98;
        d[i] = last * 12;
      }
    }
    return buf;
  }

  function makeWhiteNoiseBuf(sec = 2) {
    const buf = audioCtx.createBuffer(2, Math.ceil(audioCtx.sampleRate * sec), audioCtx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return buf;
  }

  const windSrc = audioCtx.createBufferSource();
  windSrc.buffer = makeNoiseBuf(4);
  windSrc.loop = true;

  windFilterNode = audioCtx.createBiquadFilter();
  windFilterNode.type = 'bandpass';
  windFilterNode.frequency.value = 380;
  windFilterNode.Q.value = 0.85;

  const lfo = audioCtx.createOscillator();
  lfo.frequency.value = 0.07;
  const lfoAmt = audioCtx.createGain();
  lfoAmt.gain.value = 70;
  lfo.connect(lfoAmt);
  lfoAmt.connect(windFilterNode.frequency);
  lfo.start();

  windGainNode = audioCtx.createGain();
  windGainNode.gain.value = 0.005;
  windSrc.connect(windFilterNode);
  windFilterNode.connect(windGainNode);
  windGainNode.connect(masterGainNode);
  windSrc.start();

  const rainSrc = audioCtx.createBufferSource();
  rainSrc.buffer = makeWhiteNoiseBuf(2);
  rainSrc.loop = true;

  const rainHp = audioCtx.createBiquadFilter();
  rainHp.type = 'highpass';
  rainHp.frequency.value = 1000;
  const rainLp = audioCtx.createBiquadFilter();
  rainLp.type = 'lowpass';
  rainLp.frequency.value = 7500;

  rainGainNode = audioCtx.createGain();
  rainGainNode.gain.value = 0;
  rainSrc.connect(rainHp);
  rainHp.connect(rainLp);
  rainLp.connect(rainGainNode);
  rainGainNode.connect(masterGainNode);
  rainSrc.start();

  {
    const beeOsc = audioCtx.createOscillator();
    beeOsc.type = 'sawtooth';
    beeOsc.frequency.value = 220;
    const beeLp = audioCtx.createBiquadFilter();
    beeLp.type = 'lowpass';
    beeLp.frequency.value = 600;
    const beeLfo = audioCtx.createOscillator();
    beeLfo.frequency.value = 7;
    const beeLfoGain = audioCtx.createGain();
    beeLfoGain.gain.value = 18;
    beeLfo.connect(beeLfoGain);
    beeLfoGain.connect(beeOsc.detune);
    beeOsc.connect(beeLp);
    beeGainNode = audioCtx.createGain();
    beeGainNode.gain.value = 0;
    beeLp.connect(beeGainNode);
    beeGainNode.connect(masterGainNode);
    beeOsc.start();
    beeLfo.start();
  }

  iceBellGainNode = audioCtx.createGain();
  iceBellGainNode.gain.value = 1.0;
  iceBellGainNode.connect(masterGainNode);

  musicMelodyGain = audioCtx.createGain();
  musicMelodyGain.gain.value = 0;
  musicMelodyGain.connect(masterGainNode);
  musicBassGain = audioCtx.createGain();
  musicBassGain.gain.value = 0;
  musicBassGain.connect(masterGainNode);

  const muteBtn = document.createElement('button');
  muteBtn.textContent = '🔊';
  muteBtn.title = 'Toggle sound';
  muteBtn.style.cssText = `
    position: fixed; top: 14px; right: 14px;
    background: rgba(0,0,0,0.35); border: none; border-radius: 50%;
    width: 38px; height: 38px; font-size: 17px; cursor: pointer;
    backdrop-filter: blur(6px); color: #fff; line-height: 38px; text-align: center;
    z-index: 100;
  `;
  muteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (audioCtx.state === 'running') {
      audioCtx.suspend();
      muteBtn.textContent = '🔇';
    } else {
      audioCtx.resume();
      muteBtn.textContent = '🔊';
    }
  });
  document.body.appendChild(muteBtn);

  updateAudioForSeason(seasonIndex);
}

function playMusicNote(freq, time, dur, wave, gainNode, peakGain, attack = 0.04, decay = 0.18) {
  if (!freq || freq === 0) return;
  const osc = audioCtx.createOscillator();
  const env = audioCtx.createGain();
  osc.type = wave;
  osc.frequency.value = freq;
  env.gain.setValueAtTime(0, time);
  env.gain.linearRampToValueAtTime(peakGain, time + attack);
  env.gain.setTargetAtTime(0, time + attack, decay);
  osc.connect(env);
  env.connect(gainNode);
  osc.start(time);
  osc.stop(time + dur + 0.3);
}

function runMusicScheduler() {
  if (!audioCtx || currentSeasonMusicIdx < 0) return;
  const LOOKAHEAD = 0.15;
  const sm = SEASON_MUSIC[currentSeasonMusicIdx];
  const now = audioCtx.currentTime;

  while (musicNextTime < now + LOOKAHEAD) {
    const mFreq = sm.melodyNotes[musicMelodyIdx % sm.melodyNotes.length];
    const mDur  = sm.melodyDurs[musicMelodyIdx % sm.melodyDurs.length];
    playMusicNote(mFreq, musicNextTime, mDur, sm.melodyWave, musicMelodyGain, sm.melodyGain);
    musicMelodyIdx++;

    const bFreq = sm.bassNotes[musicBassIdx % sm.bassNotes.length];
    const bDur  = sm.bassDurs[musicBassIdx % sm.bassDurs.length];
    if (musicBassIdx === 0 || musicNextTime >= _musicBassNextTime) {
      playMusicNote(bFreq, musicNextTime, bDur, sm.bassWave, musicBassGain, sm.bassGain, 0.06, 0.28);
      _musicBassNextTime = musicNextTime + bDur;
      musicBassIdx++;
    }

    musicNextTime += mDur;
  }
}
let _musicBassNextTime = 0;

function startSeasonMusic(idx) {
  if (!audioCtx) return;
  if (musicSchedulerTimer) { clearInterval(musicSchedulerTimer); musicSchedulerTimer = null; }
  if (musicMelodyGain) musicMelodyGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.4);
  if (musicBassGain)   musicBassGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.4);

  currentSeasonMusicIdx = idx;
  musicMelodyIdx = 0;
  musicBassIdx = 0;
  _musicBassNextTime = 0;
  musicNextTime = audioCtx.currentTime + 0.6;

  setTimeout(() => {
    if (!audioCtx) return;
    musicMelodyGain.gain.setTargetAtTime(1.35, audioCtx.currentTime, 0.6);
    musicBassGain.gain.setTargetAtTime(1.10, audioCtx.currentTime, 0.6);
    musicSchedulerTimer = setInterval(runMusicScheduler, 80);
  }, 700);
}

function scheduleNextIceBell() {
  if (!audioCtx || currentSeasonMusicIdx !== 2) return;
  const bellFreqs = [587.33, 698.46, 880.00, 523.25, 659.25, 1046.50, 783.99];
  const freq = bellFreqs[Math.floor(Math.random() * bellFreqs.length)];
  const t = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const env = audioCtx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(0.07, t + 0.01);
  env.gain.exponentialRampToValueAtTime(0.001, t + 2.2);
  osc.connect(env);
  env.connect(iceBellGainNode);
  osc.start(t);
  osc.stop(t + 2.5);
  iceBellTimer = setTimeout(scheduleNextIceBell, 2000 + Math.random() * 4000);
}

function updateAudioForSeason(idx) {
  if (!audioInitialized || !audioCtx) return;
  const t = audioCtx.currentTime;

  const windSettings = [
    { freq: 420, gain: 0.010 },
    { freq: 255, gain: 0.035 },
    { freq: 175, gain: 0.040 },
    { freq: 530, gain: 0.025 },
  ];
  const w = windSettings[idx];
  windFilterNode.frequency.setTargetAtTime(w.freq, t, 0.7);
  windGainNode.gain.setTargetAtTime(w.gain, t, 0.7);

  if (birdTimer) { clearInterval(birdTimer); birdTimer = null; }
  if (idx === 0 || idx === 3) {
    const baseInterval = idx === 3 ? 2200 : 4500;
    birdTimer = setInterval(() => {
      if (audioInitialized && audioCtx && audioCtx.state === 'running') {
        scheduleChirp(idx === 3);
      }
    }, baseInterval + Math.random() * 2000);
  }

  beeGainNode.gain.setTargetAtTime(idx === 3 ? 0.030 : 0, t, 1.2);

  if (iceBellTimer) { clearTimeout(iceBellTimer); iceBellTimer = null; }
  if (idx === 2) {
    iceBellTimer = setTimeout(scheduleNextIceBell, 1500 + Math.random() * 3000);
  }

  startSeasonMusic(idx);
}

function scheduleChirp(isSpring) {
  if (!audioCtx || !masterGainNode) return;
  const t = audioCtx.currentTime;
  const count = isSpring ? 2 + Math.floor(Math.random() * 3) : 1 + Math.floor(Math.random() * 2);
  for (let i = 0; i < count; i++) {
    const delay = i * (0.10 + Math.random() * 0.13);
    const base = 1500 + Math.random() * 1000;
    const osc = audioCtx.createOscillator();
    const env = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(base, t + delay);
    osc.frequency.exponentialRampToValueAtTime(base * 1.38, t + delay + 0.07);
    osc.frequency.exponentialRampToValueAtTime(base * 1.05, t + delay + 0.14);
    env.gain.setValueAtTime(0, t + delay);
    env.gain.linearRampToValueAtTime(0.055, t + delay + 0.025);
    env.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.18);
    osc.connect(env);
    env.connect(masterGainNode);
    osc.start(t + delay);
    osc.stop(t + delay + 0.22);
  }
}

function setRainSound(active) {
  if (!audioInitialized || !audioCtx) return;
  rainGainNode.gain.setTargetAtTime(active ? 0.20 : 0, audioCtx.currentTime, 0.9);
}
//background trees

function createBlockyTree(x, z, scale) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);

  const trunkMat = new THREE.MeshStandardMaterial({ color: '#2a1208', roughness: 0.93 });
  const leafMat = new THREE.MeshStandardMaterial({ color: '#72b840', roughness: 0.85 });
  const up = new THREE.Vector3(0, 1, 0);

  const addCyl = (from, to, rTop, rBot) => {
    const dir = to.clone().sub(from);
    const len = dir.length();
    if (len < 0.001) return;
    const dn = dir.clone().normalize();
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, len, 6), trunkMat);
    mesh.position.copy(from).addScaledVector(dn, len * 0.5);
    mesh.quaternion.setFromUnitVectors(up, dn);
    mesh.castShadow = true;
    group.add(mesh);
  };

  const th = 7.5 * scale;
  addCyl(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, th, 0), 0.20 * scale, 0.36 * scale);

  const branchDefs = [
    [0.62, 1.00, 0.42, 0.25, 4.2],
    [0.60, -0.95, 0.40, 0.18, 4.0],
    [0.68, 0.18, 0.38, -1.00, 3.8],
    [0.66, -0.18, 0.42, 0.95, 3.9],
    [0.58, 0.70, 0.33, -0.60, 3.5],
    [0.60, -0.65, 0.36, 0.65, 3.4],
  ];

  const leafCenters = [];
  for (const [yf, dx, dy, dz, blen] of branchDefs) {
    const from = new THREE.Vector3(0, th * yf, 0);
    const dir = new THREE.Vector3(dx, dy, dz).normalize();
    const to  = from.clone().addScaledVector(dir, blen * scale);
    addCyl(from, to, 0.085 * scale, 0.16 * scale);
    leafCenters.push(to.clone());

    for (let si = 0; si < 2; si++) {
      const splitT = 0.42 + si * 0.28;
      const subFrom = from.clone().addScaledVector(dir, blen * scale * splitT);
      const subDir = new THREE.Vector3(
        dx + (Math.random() - 0.5 + (si === 0 ? 0.4 : -0.4)) * 0.65,
        dy + 0.12 + Math.random() * 0.18,
        dz + (Math.random() - 0.5) * 0.65
      ).normalize();
      const subLen = blen * scale * (0.48 + Math.random() * 0.22);
      const subTo = subFrom.clone().addScaledVector(subDir, subLen);
      addCyl(subFrom, subTo, 0.040 * scale, 0.085 * scale);
      leafCenters.push(subTo.clone());

      const terFrom = subFrom.clone().addScaledVector(subDir, subLen * 0.52);
      const terDir = new THREE.Vector3(
        subDir.x + (Math.random() - 0.5) * 0.55,
        subDir.y + 0.08 + Math.random() * 0.12,
        subDir.z + (Math.random() - 0.5) * 0.55
      ).normalize();
      const terTo = terFrom.clone().addScaledVector(terDir, subLen * 0.52);
      addCyl(terFrom, terTo, 0.018 * scale, 0.040 * scale);
      leafCenters.push(terTo.clone());
    }
  }

  const leafMeshesForTree = [];
  const canopyCenter = new THREE.Vector3(0, th * 0.7, 0);
  const maxCanopyRadius = 5.5 * scale;

  for (let i = 0; i < 46; i++) {
    const center = leafCenters[i % leafCenters.length];
    const w = (1.4 + Math.random() * 1.9) * scale;
    const h = (0.65 + Math.random() * 1.05) * scale;
    const d = (1.2 + Math.random() * 1.7) * scale;
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), leafMat);

    let lx = center.x + (Math.random() - 0.5) * 2.4 * scale;
    let ly = center.y + (Math.random() * 1.6 - 0.3) * scale;
    let lz = center.z + (Math.random() - 0.5) * 2.4 * scale;

    const ldx = lx - canopyCenter.x;
    const ldz = lz - canopyCenter.z;
    const horizDist = Math.sqrt(ldx * ldx + ldz * ldz);
    if (horizDist > maxCanopyRadius) {
      const pullback = maxCanopyRadius / horizDist;
      lx = canopyCenter.x + ldx * pullback;
      lz = canopyCenter.z + ldz * pullback;
    }
    ly = Math.max(ly, th * 0.35);

    leaf.position.set(lx, ly, lz);
    leaf.rotation.set(
      (Math.random() - 0.5) * 0.5,
      Math.random() * Math.PI * 2,
      (Math.random() - 0.5) * 0.5
    );
    leaf.castShadow = true;
    leaf.receiveShadow = true;
    group.add(leaf);
    leafMeshesForTree.push(leaf);
  }

  scene.add(group);
  treeLeafMeshes.push(leafMeshesForTree);
  treeLeafMats.push(leafMat);
  return group;
}

createBlockyTree(-18, -14, 1.35);
createBlockyTree( 16, -16, 1.10);
createBlockyTree(-24, 4, 1.45);

// dandelion growth system
class ProceduralDandelion {
  constructor() {
    this.group = new THREE.Group();
    this.leafMaterial = this.createLeafMaterial();
  }

  createRealisticLeaf() {
    const leafShape = new THREE.Shape();
    leafShape.moveTo(0, 0);

    const leftPoints = [
      { x: -0.02, y: 0.1 }, { x: -0.08, y: 0.15 }, { x: -0.05, y: 0.2 },
      { x: -0.12, y: 0.3 }, { x: -0.06, y: 0.35 }, { x: -0.15, y: 0.45 },
      { x: -0.07, y: 0.5 }, { x: -0.13, y: 0.6 }, { x: -0.05, y: 0.65 },
      { x: -0.08, y: 0.75 }, { x: -0.02, y: 0.85 }, { x: 0, y: 1.0 }
    ];
    leftPoints.forEach(p => leafShape.lineTo(p.x, p.y));

    const rightPoints = [
      { x: 0.02, y: 0.85 }, { x: 0.07, y: 0.75 }, { x: 0.04, y: 0.65 },
      { x: 0.11, y: 0.6 }, { x: 0.06, y: 0.5 }, { x: 0.14, y: 0.45 },
      { x: 0.05, y: 0.35 }, { x: 0.10, y: 0.3 }, { x: 0.04, y: 0.2 },
      { x: 0.07, y: 0.15 }, { x: 0.02, y: 0.1 }, { x: 0, y: 0 }
    ];
    rightPoints.forEach(p => leafShape.lineTo(p.x, p.y));

    const leafGeo = new THREE.ExtrudeGeometry(leafShape, {
      depth: 0.01,
      bevelEnabled: true,
      bevelThickness: 0.005,
      bevelSize: 0.002,
      bevelSegments: 2
    });

    const positions = leafGeo.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const y = positions.getY(i);
      const bend = Math.sin(y * 3) * 0.02;
      positions.setZ(i, positions.getZ(i) + bend);
      const x = positions.getX(i);
      positions.setY(i, positions.getY(i) + Math.abs(x) * 0.1);
    }
    leafGeo.computeVertexNormals();
    return leafGeo;
  }

  createAdvancedStem(height = 1.5) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0.01, height * 0.25, 0.005),
      new THREE.Vector3(-0.008, height * 0.5, 0.01),
      new THREE.Vector3(0.005, height * 0.75, -0.005),
      new THREE.Vector3(0, height, 0)
    ]);

    const stemGeo = new THREE.TubeGeometry(curve, 20, 0.035, 8, false);
    const positions = stemGeo.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const y = positions.getY(i);
      const noise = (Math.sin(y * 10) * 0.002);
      positions.setX(i, positions.getX(i) + noise);
    }
    stemGeo.computeVertexNormals();
    return stemGeo;
  }

  createYellowFlower() {
    const flowerGroup = new THREE.Group();
    const totalRings = 6;

    for (let ring = 0; ring < totalRings; ring++) {
      const theta = (ring / (totalRings - 1)) * Math.PI * 0.5;
      const ringRadius = Math.sin(theta) * 0.18;
      const ringHeight = Math.cos(theta) * 0.1 - 0.05;
      const petalsInRing = Math.floor(30 - ring * 4);

      for (let i = 0; i < petalsInRing; i++) {
        const petalShape = new THREE.Shape();
        const petalLength = 0.5 - ring * 0.05;
        const petalWidth = 0.04;
        petalShape.moveTo(0, 0);
        petalShape.quadraticCurveTo(petalLength * 0.2, petalWidth * 0.8, petalLength * 0.5, petalWidth * 0.9);
        petalShape.quadraticCurveTo(petalLength * 0.8, petalWidth * 0.6, petalLength, 0);
        petalShape.quadraticCurveTo(petalLength * 0.8, -petalWidth * 0.6, petalLength * 0.5, -petalWidth * 0.9);
        petalShape.quadraticCurveTo(petalLength * 0.2, -petalWidth * 0.8, 0, 0);

        const petalGeo = new THREE.ExtrudeGeometry(petalShape, {
          depth: 0.002,
          bevelEnabled: true,
          bevelThickness: 0.001,
          bevelSize: 0.0005
        });

        const hue = 0.14 + (Math.random() - 0.5) * 0.015;
        const saturation = 0.95 + Math.random() * 0.05;
        const lightness = 0.5 + Math.random() * 0.1 + ring * 0.02;
        const yellowShade = new THREE.Color().setHSL(hue, saturation, lightness);
        const petalMat = new THREE.MeshStandardMaterial({
          color: yellowShade, roughness: 0.3, metalness: 0, side: THREE.DoubleSide
        });

        const petal = new THREE.Mesh(petalGeo, petalMat);
        const angle = (i / petalsInRing) * Math.PI * 2 + (ring % 2) * 0.1;
        petal.position.x = Math.cos(angle) * ringRadius;
        petal.position.z = Math.sin(angle) * ringRadius;
        petal.position.y = ringHeight;
        petal.rotation.y = angle;
        const tiltAngle = theta * 0.7;
        petal.rotation.z = tiltAngle;
        petal.rotation.x = (Math.random() - 0.5) * 0.05;
        petal.rotation.z += (Math.random() - 0.5) * 0.1;
        petal.scale.setScalar(0.9 + Math.random() * 0.2);
        petal.castShadow = true;
        flowerGroup.add(petal);
      }
    }

    const topTuftCount = 12;
    for (let i = 0; i < topTuftCount; i++) {
      const petalShape = new THREE.Shape();
      const petalLength = 0.25 + Math.random() * 0.05;
      const petalWidth = 0.035;
      petalShape.moveTo(0, 0);
      petalShape.quadraticCurveTo(petalLength * 0.3, petalWidth, petalLength * 0.7, petalWidth * 0.7);
      petalShape.quadraticCurveTo(petalLength * 0.9, petalWidth * 0.4, petalLength, 0);
      petalShape.quadraticCurveTo(petalLength * 0.9, -petalWidth * 0.4, petalLength * 0.7, -petalWidth * 0.7);
      petalShape.quadraticCurveTo(petalLength * 0.3, -petalWidth, 0, 0);

      const petalGeo = new THREE.ExtrudeGeometry(petalShape, { depth: 0.002, bevelEnabled: false });
      const yellowShade = new THREE.Color().setHSL(0.14, 1, 0.55 + Math.random() * 0.1);
      const petalMat = new THREE.MeshStandardMaterial({
        color: yellowShade, roughness: 0.3, metalness: 0, side: THREE.DoubleSide
      });

      const petal = new THREE.Mesh(petalGeo, petalMat);
      const angle = (i / topTuftCount) * Math.PI * 2;
      const radius = Math.random() * 0.02;
      petal.position.x = Math.cos(angle) * radius;
      petal.position.z = Math.sin(angle) * radius;
      petal.position.y = 0.05;
      petal.rotation.y = angle;
      petal.rotation.z = Math.PI * 0.4 + Math.random() * 0.2;
      petal.scale.setScalar(0.8 + Math.random() * 0.2);
      petal.castShadow = true;
      flowerGroup.add(petal);
    }

    return flowerGroup;
  }

  createAdvancedPuffBall() {
    const puffGroup = new THREE.Group();
    const seedCount = 140;
    const goldenRatio = (1 + Math.sqrt(5)) / 2;
    const angleIncrement = Math.PI * 2 * goldenRatio;

    for (let i = 0; i < seedCount; i++) {
      const t = i / seedCount;
      const inclination = Math.acos(1 - 2 * t);
      const azimuth = angleIncrement * i;

      const seed = this.createDetailedSeed();
      const radius = 0.22 + Math.random() * 0.05;
      seed.position.set(
        radius * Math.sin(inclination) * Math.cos(azimuth),
        radius * Math.cos(inclination),
        radius * Math.sin(inclination) * Math.sin(azimuth)
      );
      seed.lookAt(seed.position.clone().multiplyScalar(2));
      seed.rotateX(Math.random() * 0.3);
      seed.rotateY(Math.random() * Math.PI);

      seed.traverse((child) => {
        if (child.isMesh && child.material && child.material.color) {
          const hue = 0.14 + (Math.random() - 0.5) * 0.02;
          const lightness = 0.85 + Math.random() * 0.1;
          child.material.color.setHSL(hue, 0.15, lightness);
        }
      });

      puffGroup.add(seed);
    }
    return puffGroup;
  }

  createDetailedSeed() {
    const seedGroup = new THREE.Group();

    const seedBodyGeo = new THREE.CapsuleGeometry(0.015, 0.04, 4, 6);
    const seedBodyMat = new THREE.MeshStandardMaterial({
      color: '#D4C4A8', roughness: 0.95, metalness: 0
    });
    const seedBody = new THREE.Mesh(seedBodyGeo, seedBodyMat);
    seedBody.castShadow = true;
    seedGroup.add(seedBody);

    const pappusGeo = new THREE.BufferGeometry();
    const pappusVertices = [];
    const filamentCount = 24;

    for (let i = 0; i < filamentCount; i++) {
      const angle = (i / filamentCount) * Math.PI * 2;
      const length = 0.12 + Math.random() * 0.03;
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0.02, 0),
        new THREE.Vector3(
          Math.cos(angle) * length * 0.3,
          0.05 + Math.random() * 0.01,
          Math.sin(angle) * length * 0.3
        ),
        new THREE.Vector3(
          Math.cos(angle) * length,
          0.04 + Math.random() * 0.02,
          Math.sin(angle) * length
        )
      ]);
      const points = curve.getPoints(8);
      for (let j = 0; j < points.length - 1; j++) {
        pappusVertices.push(
          points[j].x, points[j].y, points[j].z,
          points[j + 1].x, points[j + 1].y, points[j + 1].z
        );
      }
    }

    pappusGeo.setAttribute('position', new THREE.Float32BufferAttribute(pappusVertices, 3));
    const pappusMat = new THREE.LineBasicMaterial({
      color: '#F5F0E8', transparent: true, opacity: 0.7
    });
    const pappus = new THREE.LineSegments(pappusGeo, pappusMat);
    seedGroup.add(pappus);

    seedGroup.userData.type = 'puffSeed';
    return seedGroup;
  }

  createLeafMaterial() {
    return new THREE.MeshStandardMaterial({
      color: '#7bb05a', roughness: 0.8, metalness: 0.1, side: THREE.DoubleSide,
      transparent: false, opacity: 1
    });
  }

  assembleDandelion(growthStage = 0) {
    const dandelion = new THREE.Group();
    const stemHeight = 0.2 + growthStage * 1.6;
    const stem = new THREE.Mesh(
      this.createAdvancedStem(stemHeight),
      new THREE.MeshStandardMaterial({ color: '#6ea557', roughness: 0.85, metalness: 0 })
    );
    stem.castShadow = true;
    dandelion.add(stem);

    if (growthStage <= 0.15) {
      const initialBud = new THREE.Mesh(
        new THREE.SphereGeometry(0.08 + growthStage * 0.4, 16, 16),
        new THREE.MeshStandardMaterial({
          color: '#b5e88a', roughness: 0.7, metalness: 0,
          emissive: '#b5e88a', emissiveIntensity: 0.1
        })
      );
      initialBud.position.y = stemHeight;
      initialBud.castShadow = true;
      dandelion.add(initialBud);
    }

    if (growthStage > 0.1) {
      const leafCount = growthStage >= 0.2 ? 2 : Math.min(2, Math.round(growthStage * 10));
      for (let i = 0; i < leafCount; i++) {
        const leaf = new THREE.Mesh(
          this.createRealisticLeaf(),
          this.leafMaterial.clone()
        );
        const angle = i * Math.PI + Math.PI / 4;
        const distance = 0.05;
        leaf.position.set(Math.cos(angle) * distance, 0.02, Math.sin(angle) * distance);
        leaf.rotation.y = angle;
        leaf.rotation.z = 0.4 + (i * 0.15);
        leaf.rotation.x = -0.3;
        const leafScale = 0.3 + Math.min(growthStage, 1) * 0.5;
        leaf.scale.setScalar(leafScale * (0.9 + (i % 2) * 0.2));
        leaf.castShadow = true;
        leaf.receiveShadow = true;
        dandelion.add(leaf);
      }
    }

    return dandelion;
  }
}

const dandelionSystem = new ProceduralDandelion();

const plant = new THREE.Group();
plant.position.set(
  activeMound.position.x,
  activeMound.position.y + 0.45,
  activeMound.position.z
);
plant.visible = false;
scene.add(plant);

let stem = null;
let bud = null;
let yellowFlower = null;
let puff = null;
let cachedLeaves = [];

//wind system

const WIND_POOL_SIZE = 50;
/** @typedef {{line: THREE.Line, life: number, maxLife: number, vel: THREE.Vector3, mat: THREE.LineBasicMaterial}} WindSwoosh */
/** @type {WindSwoosh[]} */
const windPool = [];

for (let i = 0; i < WIND_POOL_SIZE; i++) {
  const geo = new THREE.BufferGeometry();
  const mat = new THREE.LineBasicMaterial({ color: "#c8e8ff", transparent: true, opacity: 0 });
  const line = new THREE.Line(geo, mat);
  scene.add(line);
  windPool.push({ line, life: 0, maxLife: 1, vel: new THREE.Vector3(), mat });
}

//wind swirl
function buildSwooshPoints(len, curlRadius, curlTurns, curlAtEnd) {
  const pts = [];
  const CURL_SEGS = 24;
  const LINE_SEGS = 10;

  if (!curlAtEnd) {
    for (let i = CURL_SEGS; i >= 0; i--) {
      const t = i / CURL_SEGS;
      const angle = t * curlTurns * Math.PI * 2;
      const r = curlRadius * t;
      pts.push(new THREE.Vector2(-r * Math.cos(angle), r * Math.sin(angle)));
    }
    const startX = 0;
    for (let i = 1; i <= LINE_SEGS; i++) {
      const t = i / LINE_SEGS;
      pts.push(new THREE.Vector2(
        startX + t * len,
        Math.sin(t * Math.PI * 1.2) * curlRadius * 0.3
      ));
    }
  } else {
    for (let i = 0; i <= LINE_SEGS; i++) {
      const t = i / LINE_SEGS;
      pts.push(new THREE.Vector2(
        t * len,
        Math.sin(t * Math.PI * 1.1) * curlRadius * 0.35
      ));
    }
    const endX = len;
    for (let i = 0; i <= CURL_SEGS; i++) {
      const t = i / CURL_SEGS;
      const angle = t * curlTurns * Math.PI * 2;
      const r = curlRadius * (1 - t);
      pts.push(new THREE.Vector2(
        endX + r * Math.cos(angle),
        r * Math.sin(angle)
      ));
    }
  }
  return pts;
}

const SWIRL_COUNT = 60;
const swirlPositions = new Float32Array(SWIRL_COUNT * 3);
/** @type {{angle: number, radius: number, height: number, speed: number}[]} */
const swirlData = [];
for (let i = 0; i < SWIRL_COUNT; i++) {
  swirlData.push({
    angle: (i / SWIRL_COUNT) * Math.PI * 2,
    radius: 0.6 + Math.random() * 1.4,
    height: (Math.random() - 0.5) * 1.8,
    speed: 4.0 + Math.random() * 5.0,
  });
}
const swirlGeo = new THREE.BufferGeometry();
swirlGeo.setAttribute("position", new THREE.BufferAttribute(swirlPositions, 3));
const swirlMat = new THREE.PointsMaterial({ color: "#e0f4ff", size: 0.12, transparent: true, opacity: 0 });
const swirlPoints = new THREE.Points(swirlGeo, swirlMat);
scene.add(swirlPoints);

const MOTE_COUNT = 220;
const motePositions = new Float32Array(MOTE_COUNT * 3);
/** @type {THREE.Vector3[]} */
const moteVelocities = [];
for (let i = 0; i < MOTE_COUNT; i++) {
  motePositions[i * 3] = (Math.random() - 0.5) * 6;
  motePositions[i * 3 + 1] = 1 + Math.random() * 3;
  motePositions[i * 3 + 2] = (Math.random() - 0.5) * 6;
  moteVelocities.push(new THREE.Vector3(0, 0, 0));
}
const moteGeo = new THREE.BufferGeometry();
moteGeo.setAttribute("position", new THREE.BufferAttribute(motePositions, 3));
const moteMat = new THREE.PointsMaterial({ color: "#dff4ff", size: 0.10, transparent: true, opacity: 0 });
const motes = new THREE.Points(moteGeo, moteMat);
scene.add(motes);

let globalWindStrength = 0;
let windGustTimer = 0;
const WIND_GUST_DURATION = 4.5;

function spawnWindRibbon(origin, strength) {
  const slot = windPool.find(w => w.life <= 0);
  if (!slot) return;

  const len = 2.0 + strength * 3.5 + Math.random() * 2.5;
  const curlR = 0.18 + Math.random() * 0.35;
  const curlTurns = 1.2 + Math.random() * 1.5;
  const curlAtEnd = Math.random() > 0.4;

  const pts2d = buildSwooshPoints(len, curlR, curlTurns, curlAtEnd);

  const yBase = origin.y + (Math.random() - 0.5) * 0.3;
  const positions = new Float32Array(pts2d.length * 3);
  for (let i = 0; i < pts2d.length; i++) {
    positions[i * 3] = origin.x + pts2d[i].x;
    positions[i * 3 + 1] = yBase + pts2d[i].y;
    positions[i * 3 + 2] = origin.z + (Math.random() - 0.5) * 0.08;
  }

  slot.line.geometry.dispose();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  slot.line.geometry = geo;
  slot.line.position.set(0, 0, 0);
  slot.line.rotation.set(0, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.15);

  const hue = Math.random();
  slot.mat.color.setStyle(hue > 0.5 ? "#e8f8ff" : "#c8e8ff");
  slot.mat.opacity = 0.4 + strength * 0.45;
  slot.maxLife = 0.7 + Math.random() * 0.8;
  slot.life = slot.maxLife;
  slot.vel.set(3.0 + strength * 4.0 + Math.random() * 1.5, (Math.random() - 0.5) * 0.15, (Math.random() - 0.5) * 0.3);
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
    mp[i * 3] = epicenter.x + (Math.random() - 0.5) * 5;
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
    swirlMat.opacity = Math.max(0, swirlMat.opacity - dt * 1.2);
    moteMat.opacity  = Math.max(0, moteMat.opacity  - dt * 0.6);
  }

  const shader = grass.material.userData.shader;
  if (shader) {
    if (grass.material.userData.prevTime === undefined) {
      grass.material.userData.prevTime = elapsed;
    }
    const smoothTime = grass.material.userData.prevTime + dt;
    grass.material.userData.prevTime = smoothTime;
    shader.uniforms.time.value = smoothTime;
    shader.uniforms.windStrength.value = globalWindStrength;
  }

  for (const w of windPool) {
    if (w.life <= 0) continue;
    w.life -= dt;
    w.line.position.addScaledVector(w.vel, dt);
    const lifeFrac = w.life / w.maxLife;
    w.mat.opacity = lifeFrac * (0.3 + globalWindStrength * 0.5);
    if (w.life <= 0) w.mat.opacity = 0;
  }

  if (swirlMat.opacity > 0.01 && seedPos) {
    const sp = swirlGeo.attributes.position.array;
    for (let i = 0; i < SWIRL_COUNT; i++) {
      const d = swirlData[i];
      d.angle += d.speed * dt;
      const r = d.radius * (0.6 + 0.4 * Math.sin(elapsed * 1.4 + i));
      sp[i * 3] = seedPos.x + Math.cos(d.angle) * r;
      sp[i * 3 + 1] = seedPos.y + d.height + Math.sin(elapsed * 2 + i * 0.3) * 0.15;
      sp[i * 3 + 2] = seedPos.z + Math.sin(d.angle) * r;
    }
    swirlGeo.attributes.position.needsUpdate = true;
  }

  if (moteMat.opacity > 0.01) {
    const mp = moteGeo.attributes.position.array;
    for (let i = 0; i < MOTE_COUNT; i++) {
      moteVelocities[i].y += Math.sin(elapsed * 1.3 + i * 0.22) * 0.06 * dt;
      mp[i * 3] += moteVelocities[i].x * dt;
      mp[i * 3 + 1] += moteVelocities[i].y * dt;
      mp[i * 3 + 2] += moteVelocities[i].z * dt;
      if (mp[i * 3] > 45 || mp[i * 3 + 1] > 8 || mp[i * 3 + 1] < 0) {
        mp[i * 3] = (Math.random() - 0.5) * 6;
        mp[i * 3 + 1] = 0.5 + Math.random() * 2.5;
        mp[i * 3 + 2] = (Math.random() - 0.5) * 4;
        moteVelocities[i].set(0, 0, 0);
      }
    }
    moteGeo.attributes.position.needsUpdate = true;
  }
}

//seeds
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
// FIX: dynamic drag plane (set per-drag in pointerdown)
const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

/** @type {THREE.Object3D|null} */
let dragging = null;

let growth = 0;
let rainActive = false;
let wetness = 0;
/** @type {SeedEntry|null} */
let followedSeed = null;
let rainClouds = null;
let seedsAwaitingSelection = false;

// seed selection
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

// handlers for the current state of the game
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
  seedsAwaitingSelection = false;
  cameraZoomingOut = false;
  gustAccumulator = 0;
  selectionRing.visible = false;
  gustMeterContainer.style.display = "none";
  windGust.active = false;
  windGust.applied = false;
  rainMat.opacity = 0;

  // Clear all plant children
  while (plant.children.length > 0) {
    plant.remove(plant.children[0]);
  }

  plant.visible = false;
  plant.position.set(
    activeMound.position.x,
    activeMound.position.y + 0.45,
    activeMound.position.z
  );

  stem = null;
  bud = null;
  yellowFlower = null;
  puff = null;
  cachedLeaves = [];

  if (reuseSameMound) {
    state.planted = true;
    plant.visible = true;
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

// selectig and deselecting seeds
let cameraZoomingOut = false;

function selectSeed(seed) {
  selectedSeed = seed;
  seedsAwaitingSelection = false;
  cameraZoomingOut = true;
  selectionRing.visible = true;

  windGust.active = false;
  windGust.applied = false;
  gustAccumulator = 0;
  gustMeterContainer.style.display = "none";
  if (gustBar) gustBar.style.width = "0%";

  setTimeout(() => {
    if (selectedSeed === seed) {
      windGust.active = true;
      gustMeterContainer.style.display = "flex";
      setStatus("Seed selected! Wave your mouse rapidly near it to create a gust!");
    }
  }, 1400);
}

function deselectSeed() {
  selectedSeed = null;
  windGust.active = false;
  gustAccumulator = 0;
  gustMeterContainer.style.display = "none";
  selectionRing.visible = false;
}

// input
window.addEventListener("pointerdown", (event) => {
  initAudio();
  toNdc(event);
  raycaster.setFromCamera(pointer, camera);

  const clickables = [activeMound, sun, ...clouds];

  seeds.forEach(s => {
    if (s.mesh) clickables.push(s.mesh);
  });

  if (puff && state.puff) {
    clickables.push(puff);
  } else if (bud) {
    clickables.push(bud);
  }

  const hits = raycaster.intersectObjects(clickables, true);
  if (!hits.length) return;

  // Collect all seeds that were hit
  const hitSeeds = [];
  for (const hit of hits) {
    const target = hit.object;
    const foundSeed = seeds.find(s => {
      let checkParent = target;
      while (checkParent) {
        if (checkParent === s.mesh) return true;
        if (checkParent.userData && checkParent.userData.type === 'puffSeed') {
          return s.mesh === checkParent;
        }
        checkParent = checkParent.parent;
      }
      return false;
    });
    if (foundSeed && !hitSeeds.find(h => h.seed === foundSeed)) {
      hitSeeds.push({ seed: foundSeed, distance: hit.distance });
    }
  }

  let pickedSeed = null;
  if (hitSeeds.length > 0) {
    if (hitSeeds.length === 1) {
      pickedSeed = hitSeeds[0].seed;
    } else {
      let minScreenDist = Infinity;
      for (const { seed } of hitSeeds) {
        const screenPos = seed.mesh.position.clone().project(camera);
        const screenDist = Math.sqrt(
          Math.pow(screenPos.x - pointer.x, 2) +
          Math.pow(screenPos.y - pointer.y, 2)
        );
        if (screenDist < minScreenDist) {
          minScreenDist = screenDist;
          pickedSeed = seed;
        }
      }
    }
  }

  if (pickedSeed) {
    if (pickedSeed.phase === 'normal' && !pickedSeed.gustApplied) {
      selectedSeed === pickedSeed ? deselectSeed() : selectSeed(pickedSeed);
    }
    return;
  }

  const target = hits[0].object;

  if (target.userData.type === "cloud" || target.parent?.userData.type === "cloud" ||
      target.userData.draggable || target.parent?.userData.draggable) {
    const cloudGroup = target.parent?.userData.type === "cloud" ? target.parent
      : target.parent?.userData.draggable ? target.parent : target;
    if (!state.planted) return;
    if (!rainActive) {
      dragging = cloudGroup;
      dragPlane.set(new THREE.Vector3(0, 1, 0), -cloudGroup.position.y);
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
    plant.position.set(
      activeMound.position.x,
      activeMound.position.y + 0.45,
      activeMound.position.z
    );
    growth = 0.08;
    updateDandelionDuringRain();
    setStatus("Great. Make it rain by dragging the clouds together over the mound, and then clicking a cloud to make it rain!");
    return;
  }

  if ((target === sun || target.parent === sun) && state.watered && !state.puff) {
    state.blooming = true;
    lightCone.visible = true;
    setStatus("Sunlight helps it grow. Wait for bloom...");
    return;
  }

  if (state.puff && puff) {
    let checkParent = target;
    while (checkParent) {
      if (checkParent === puff) {
        disperseSeeds();
        return;
      }
      checkParent = checkParent.parent;
    }
  }
});

window.addEventListener("pointerup", () => {
  dragging = null;
  dragOffset.set(0, 0, 0);
});

window.addEventListener("pointermove", (event) => {
  if (dragging && !rainActive) {
    toNdc(event);
    raycaster.setFromCamera(pointer, camera);

    const dot = raycaster.ray.direction.dot(dragPlane.normal);
    if (Math.abs(dot) > 0.05 && raycaster.ray.intersectPlane(dragPlane, tmpV3)) {
      const br = 12;
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

//swirly gust of wind
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

  cameraZoomingOut = false;

  // Remove all OTHER seeds
  for (const s of seeds) {
    if (s === seed) continue;
    scene.remove(s.mesh);
    s.active = false;
    s.landed = true;
  }
  seeds.length = 0;
  seeds.push(seed);

  // Reset mound to dry state
  wetness = 0;
  const dryColor = new THREE.Color("#795641");
  const mMat = /** @type {THREE.MeshStandardMaterial} */ (activeMound.material);
  mMat.color.copy(dryColor);
  mMat.roughness = 0.95;

  // hide plant during gust
  while (plant.children.length > 0) {
    plant.remove(plant.children[0]);
  }
  plant.visible = false;
  cachedLeaves = [];

  cloudsReturning = true;

  followedSeed = seed;
  deselectSeed();
  setStatus("Away it goes! Watch the seed soar...");
}

// disperse seeds
function disperseSeeds() {
  if (!state.puff) return;
  state.puff = false;

  if (puff && puff.parent) {
    plant.remove(puff);
  }

  const seedCount = 45;

  for (let i = 0; i < seedCount; i++) {
    const seedMesh = dandelionSystem.createDetailedSeed();
    seedMesh.scale.setScalar(0.7 + Math.random() * 0.3);
    seedMesh.userData.type = "seed";
    scene.add(seedMesh);

    const ang = Math.random() * Math.PI * 2;
    const rad = 0.25 + Math.random() * 0.3;
    const stemHeight = 0.2 + 0.7 * 1.6;
    const startHeight = stemHeight + 0.1;
    seedMesh.position.set(
      plant.position.x + Math.cos(ang) * rad,
      plant.position.y + startHeight,
      plant.position.z + Math.sin(ang) * rad
    );

    const upDraft = 0.05 + Math.random() * 0.1;
    const horizontalSpread = 0.15 + Math.random() * 0.1;
    const baseVel = new THREE.Vector3(
      (Math.random() - 0.5) * horizontalSpread,
      upDraft - Math.random() * 0.1,
      (Math.random() - 0.5) * horizontalSpread
    );

    const gDir = new THREE.Vector3(
      Math.cos(ang) * 0.1, 0, Math.sin(ang) * 0.1
    );
    const breeze = windDirection.clone().multiplyScalar(0.02 + Math.random() * 0.03);

    seeds.push({
      mesh: seedMesh,
      velocity: baseVel.add(gDir).add(breeze),
      active: true,
      landed: false,
      gustApplied: false,
      phase: 'normal',
      phaseTimer: 0,
      startPos: new THREE.Vector3(),
      peakPos: new THREE.Vector3(),
      returnProgress: 0,
      spinAxis: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(),
      spinSpeed: (Math.random() - 0.5) * 2,
    });
  }

  while (plant.children.length > 0) {
    plant.remove(plant.children[0]);
  }
  const finalDandelion = dandelionSystem.assembleDandelion(0.7);
  plant.add(finalDandelion);

  setStatus("Seeds dispersed! Click a landed seed, then wave your mouse to send it on a journey!");
}

// update rain
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

      // Grow yellow flower during rain
      if (state.planted && !state.watered) {
        growth = Math.min(0.7, growth + dt * 0.18);
        updateDandelionDuringRain();
        if (wetness < 1) setStatus("The plant is growing! Keep watering!");
      }
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
      pos[i * 6 + 1] -= rainVel[i] * dt;
      if (pos[i * 6 + 1] < -0.3) {
        pos[i * 6] = spawnCX + (Math.random() - 0.5) * 2.8;
        pos[i * 6 + 1] = 10 + Math.random() * 2;
        pos[i * 6 + 2] = spawnCZ + (Math.random() - 0.5) * 2.0 + 0.7;
      }
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
    growth = 0.7;
    updateDandelionDuringRain();
    setStatus("Beautiful yellow flower! Now click the sun to transform it to a puff.");
  }
}

// Procedural dandelion growth during rain
function updateDandelionDuringRain() {
  const children = [...plant.children];
  for (const child of children) {
    if (!cachedLeaves.includes(child) && child !== bud) {
      plant.remove(child);
    }
  }

  const stemHeight = 0.2 + growth * 1.6;
  const newStem = new THREE.Mesh(
    dandelionSystem.createAdvancedStem(stemHeight),
    new THREE.MeshStandardMaterial({ color: '#6ea557', roughness: 0.85, metalness: 0 })
  );
  newStem.castShadow = true;
  plant.add(newStem);

  if (!yellowFlower) {
    if (!bud) {
      bud = new THREE.Mesh(
        new THREE.SphereGeometry(1, 16, 16),
        new THREE.MeshStandardMaterial({
          color: '#b5e88a', roughness: 0.9, metalness: 0
        })
      );
      bud.castShadow = true;
    }

    const budScale = 0.06 + growth * 0.4;
    bud.scale.setScalar(budScale);
    bud.position.y = stemHeight;

    if (growth > 0.25) {
      const colorProgress = (growth - 0.25) / 0.05;
      const lightGreenColor = new THREE.Color('#b5e88a');
      const stemGreenColor = new THREE.Color('#6ea557');
      bud.material.color.lerpColors(lightGreenColor, stemGreenColor, Math.min(1, colorProgress));
      bud.material.emissive = new THREE.Color('#000000');
      bud.material.emissiveIntensity = 0;
    }

    plant.add(bud);
  }

  if (cachedLeaves.length === 0 && growth > 0.05) {
    const leafCount = 2;
    for (let i = 0; i < leafCount; i++) {
      const leaf = new THREE.Mesh(
        dandelionSystem.createRealisticLeaf(),
        dandelionSystem.leafMaterial.clone()
      );
      const angle = i * Math.PI + Math.PI / 4;
      const distance = 0.05;
      leaf.position.set(Math.cos(angle) * distance, 0.02, Math.sin(angle) * distance);
      leaf.rotation.y = angle;
      leaf.rotation.z = 0.4 + (i * 0.15);
      leaf.rotation.x = -0.3;
      leaf.scale.setScalar(0);
      leaf.castShadow = true;
      leaf.receiveShadow = true;
      leaf.userData.appearOrder = i;
      plant.add(leaf);
      cachedLeaves.push(leaf);
    }
  }

  for (let i = 0; i < cachedLeaves.length; i++) {
    const leaf = cachedLeaves[i];
    const leafStartGrowth = 0.08 + (i * 0.12);
    if (growth > leafStartGrowth) {
      const leafGrowthProgress = Math.min(1, (growth - leafStartGrowth) / 0.25);
      const baseScale = 0.6 + leafGrowthProgress * 0.5;
      const sizeVariation = i === 0 ? 1.1 : 1.0;
      leaf.scale.setScalar(baseScale * sizeVariation * leafGrowthProgress);
    }
  }

  if (growth > 0.3) {
    if (bud) {
      bud.material.color.set('#6ea557');
      bud.scale.set(0.18, 0.08, 0.18);
      bud.position.y = stemHeight;
      plant.add(bud);
    }

    if (!yellowFlower) {
      yellowFlower = dandelionSystem.createYellowFlower();
      yellowFlower.scale.setScalar(0.1);
    }
    yellowFlower.position.y = stemHeight;
    yellowFlower.scale.setScalar(Math.min(1, (growth - 0.3) * 2.5));
    plant.add(yellowFlower);
  }
}

// Update growth
function updateGrowth(dt) {
  if (!state.blooming) return;

  growth = Math.min(1, growth + dt * 0.12);

  const children = [...plant.children];
  for (const child of children) {
    if (!cachedLeaves.includes(child)) {
      plant.remove(child);
    }
  }

  const stemHeight = 0.2 + 0.7 * 1.6;
  const newStem = new THREE.Mesh(
    dandelionSystem.createAdvancedStem(stemHeight),
    new THREE.MeshStandardMaterial({ color: '#6ea557', roughness: 0.85, metalness: 0 })
  );
  newStem.castShadow = true;
  plant.add(newStem);

  for (const leaf of cachedLeaves) {
    const fullScale = 0.6 + 0.5;
    const sizeVariation = cachedLeaves.indexOf(leaf) === 0 ? 1.1 : 1.0;
    leaf.scale.setScalar(fullScale * sizeVariation);
    if (!leaf.parent) plant.add(leaf);
  }

  const transformProgress = (growth - 0.7) / 0.3;

  if (bud && transformProgress > 0 && transformProgress < 1) {
    if (bud.parent && bud !== puff && bud !== yellowFlower) {
      plant.remove(bud);
    }
  }

  if (transformProgress < 0.5) {
    if (!yellowFlower) {
      yellowFlower = dandelionSystem.createYellowFlower();
    }
    const fullStemHeight = 0.2 + 0.7 * 1.6;
    yellowFlower.position.y = fullStemHeight;
    const fadeScale = 1 - (transformProgress * 2);
    yellowFlower.scale.setScalar(fadeScale);
    yellowFlower.traverse((child) => {
      if (child.isMesh && child.material) {
        child.material.opacity = fadeScale;
        child.material.transparent = true;
      }
    });
    plant.add(yellowFlower);
    bud = yellowFlower;
  }

  if (transformProgress > 0) {
    if (!puff) {
      puff = dandelionSystem.createAdvancedPuffBall();
      puff.scale.setScalar(0.1);
    }
    const fullStemHeight = 0.2 + 0.7 * 1.6;
    puff.position.y = fullStemHeight;
    const puffScale = Math.min(0.8, transformProgress * 0.8);
    puff.scale.setScalar(puffScale);
    plant.add(puff);
    bud = puff;

    if (transformProgress > 0.5 && yellowFlower && yellowFlower.parent) {
      plant.remove(yellowFlower);
    }
  }

  if (growth >= 1) {
    state.blooming = false;
    state.puff = true;
    setStatus("Dandelion puff ready! Click it to disperse the seeds.");
  } else if (transformProgress > 0) {
    setStatus(`Transforming to puff... ${Math.floor(transformProgress * 100)}%`);
  }
}

function updateSeeds(dt, elapsed) {
  const gravity = 0.18, drag = 0.992, terminalFall = -0.25;
  const moundTop = activeMound.position.y + 0.45;
  const moundBottom = 0.1;

  for (const seed of seeds) {
    if (!seed.active) continue;

    //seed on its way out
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

        swirlMat.opacity = 0;
        moteMat.opacity = 0;
        windGustTimer = 0;
        globalWindStrength = 0;
        for (const w of windPool) {
          w.life = 0;
          w.mat.opacity = 0;
        }

        setStatus("The wind carries it back...");
      }
      continue;
    }

    if (seed.phase === 'returning') {
      seed.returnProgress = Math.min(1, seed.returnProgress + dt * 0.30);
      const t = seed.returnProgress;
      const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

      const ctrl = new THREE.Vector3(
        (seed.peakPos.x + activeMound.position.x) * 0.5,
        Math.max(seed.peakPos.y, activeMound.position.y) + 8,
        (seed.peakPos.z + activeMound.position.z) * 0.5 + 3
      );

      const targetX = activeMound.position.x;
      const targetY = activeMound.position.y + 0.45;
      const targetZ = activeMound.position.z;

      const omt = 1 - eased;
      seed.mesh.position.set(
        omt * omt * seed.peakPos.x + 2 * omt * eased * ctrl.x + eased * eased * targetX,
        omt * omt * seed.peakPos.y + 2 * omt * eased * ctrl.y + eased * eased * targetY,
        omt * omt * seed.peakPos.z + 2 * omt * eased * ctrl.z + eased * eased * targetZ
      );

      seed.mesh.rotateOnAxis(seed.spinAxis, seed.spinSpeed * 0.28 * dt);

      if (seed.returnProgress >= 1) {
        seed.active = false;
        seed.landed = true;
        seed.phase = 'normal';
        followedSeed = null;
        scene.remove(seed.mesh);
        seeds.length = 0;

        setTimeout(() => {
          seasonIndex = (seasonIndex + 1) % SEASONS.length;
          applySeasonTheme(seasonIndex);
          resetCycle(true);

          growth = 0.08;
          updateDandelionDuringRain();

          setStatus(`The seed found home! Welcome to ${SEASONS[seasonIndex].name}! Drag the clouds over the mound to water it again.`);
        }, 500);
      }
      continue;
    }

    // normal fall
    if (seed.landed) continue;

    seed.velocity.x += Math.sin(elapsed * 1.2 + seed.mesh.id * 0.17) * 0.12 * dt;
    seed.velocity.z += Math.cos(elapsed * 1.1 + seed.mesh.id * 0.13) * 0.12 * dt;
    seed.velocity.y -= gravity * dt;
    seed.velocity.multiplyScalar(drag);
    if (seed.velocity.y < terminalFall) seed.velocity.y = terminalFall;
    seed.mesh.position.addScaledVector(seed.velocity, dt);

    // Mound-contour landing
    const dx = seed.mesh.position.x - activeMound.position.x;
    const dz = seed.mesh.position.z - activeMound.position.z;
    const distFromCenter = Math.sqrt(dx * dx + dz * dz);

    let landingY;
    if (distFromCenter < 1.9) {
      const heightRatio = 1 - (distFromCenter / 1.9);
      landingY = moundBottom + (0.45 * heightRatio);
    } else {
      landingY = moundBottom;
    }

    if (seed.mesh.position.y <= landingY) {
      seed.mesh.position.y = landingY;
      seed.velocity.set(0, 0, 0);
      seed.landed = true;
      seed.phase = 'normal';
    }
  }


  if (seeds.length > 0 && !seedsAwaitingSelection && !followedSeed && !selectedSeed) {
    const allLanded = seeds.every(s => s.landed && s.phase === 'normal');
    const noneGusted = seeds.every(s => !s.gustApplied);
    if (allLanded && noneGusted) {
      seedsAwaitingSelection = true;
    }
  }

  if (selectedSeed) {
    selectionRing.position.copy(selectedSeed.mesh.position);
    selectionRing.position.y += 0.05;
    selectionRing.scale.setScalar(0.85 + 0.15 * Math.sin(clock.elapsedTime * 6));
  }
}

// Helpers
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

// camera logic
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

  // Zoom in toward mound when seeds awaiting selection
  if (seedsAwaitingSelection) {
    const target = activeMound.position;
    camera.position.lerp(target.clone().add(new THREE.Vector3(3.0, 2.8, 3.5)), 0.03);
    camera.lookAt(target.clone().add(new THREE.Vector3(0, 1.5, 0)));
    return;
  }

  const target = activeMound.position;
  const defaultPos = target.clone().add(new THREE.Vector3(7.5, 5.5, 8));
  if (cameraZoomingOut) {
    // Fast fixed-speed zoom out
    const dir = defaultPos.clone().sub(camera.position);
    const dist = dir.length();
    if (dist > 0.15) {
      dir.normalize();
      camera.position.addScaledVector(dir, Math.min(dist, 12 * (1 / 60)));
    } else {
      camera.position.copy(defaultPos);
    }
  } else {
    camera.position.lerp(defaultPos, 0.022);
  }
  camera.lookAt(target.clone().add(new THREE.Vector3(0, 5, 0)));
}

// rendering animation loop
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.033);
  const elapsed = clock.elapsedTime;

  updateRain(dt, elapsed);
  updateGrowth(dt);
  updateSeeds(dt, elapsed);
  updateCloudsReturning(dt);

  // only pass seedPos during outbound, not returning
  const gustSeedPos = (followedSeed && followedSeed.phase === 'outbound')
    ? followedSeed.mesh.position
    : null;
  updateWindVisuals(dt, elapsed, gustSeedPos);
  updateSeasonalExtras(dt, elapsed);

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

applySeasonTheme(0);
resetCycle();
animate();