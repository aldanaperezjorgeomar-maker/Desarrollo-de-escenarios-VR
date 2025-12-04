// main.js - Versión con zombis
import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

/** ========= CONFIG ZOMBIS ========= */
const WORLD_SIZE = 260;
const TERRAIN_RES = 256;
const TERRAIN_MAX_H = 2.6;
const TREE_COUNT = 520;
const ZOMBIE_COUNT = 36; // Menos zombis que calabazas
const GRAVE_COUNT = ZOMBIE_COUNT;
const PLAYER_RADIUS = 0.35;
const OBJ_TREE_R = 0.6;
const OBJ_ZOMBIE_R = 0.8; // Mayor radio para zombis
const OBJ_GRAVE_R = 0.5;
const FOG_DENSITY = 0.032; // Más densa para ambiente más oscuro
const VR_WALK_SPEED = 5.5;
const VR_STRAFE_SPEED = 4.8;
const ARC_STEPS = 40;
const ARC_SPEED = 7.5;
const ARC_GRAVITY = 9.8;
const MAX_SLOPE_DEG = 45;
const WORLD_RADIUS = WORLD_SIZE * 0.5 - 1.0;
const ZOMBIE_AREA = 90; // Área mayor para zombis
const HDRI_LOCAL = 'assets/hdr/moonless_golf_1k.hdr';
const HDRI_FALLBACK = 'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/moonless_golf_1k.hdr';

// Configuración de zombis
const ZOMBIE_SPEED_MIN = 0.8;
const ZOMBIE_SPEED_MAX = 1.8;
const ZOMBIE_DETECTION_RANGE = 15;
const ZOMBIE_ATTACK_RANGE = 1.5;
const ZOMBIE_ATTACK_DAMAGE = 10;
const ZOMBIE_ATTACK_COOLDOWN = 1.5;
const PLAYER_MAX_HEALTH = 100;

/** ========= DOM / UI ZOMBIS ========= */
const hudTotal = document.getElementById('totalZombies');
const hudHit = document.getElementById('hitZombies');
const hudHealth = document.getElementById('health');
const healthBadge = document.getElementById('healthBadge');
const ambientEl = document.getElementById('ambient');
const zombieGroanEl = document.getElementById('zombieGroan');

/** ========= RENDERER / SCENES / CAMERA ========= */
const canvas = document.getElementById('scene');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.xr.enabled = true;
renderer.autoClear = true;

// Escena principal
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a101a);
scene.fog = new THREE.FogExp2(0x0a101a, FOG_DENSITY);

// Escena de fondo
const bgScene = new THREE.Scene();
const bgCam = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 5000);

// Cámara del jugador
const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 500);
const player = new THREE.Group();
player.position.set(0, 1.6, 3);
player.add(camera);
scene.add(player);

// Estado del juego
let playerHealth = PLAYER_MAX_HEALTH;
let gameOver = false;

/** ========= IBL / HDRI ========= */
const pmremGen = new THREE.PMREMGenerator(renderer);
pmremGen.compileEquirectangularShader();
async function setHDRI(url) {
  const hdr = await new Promise((res, rej) => new RGBELoader().load(url, (t)=>res(t), undefined, rej));
  const env = pmremGen.fromEquirectangular(hdr).texture;
  scene.environment = env;
  hdr.dispose(); pmremGen.dispose();
}
setHDRI(HDRI_LOCAL).catch(()=> setHDRI(HDRI_FALLBACK).catch(e=>console.warn('Sin HDRI:', e)));

/** ========= LUCES ========= */
const hemiLight = new THREE.HemisphereLight(0x8fb2ff, 0x0a0c10, 0.35);
scene.add(hemiLight);

/** ========= CIELO / ESTRELLAS / LUNA ========= */
const skyGeo = new THREE.SphereGeometry(2000, 48, 24);
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  depthWrite: false,
  depthTest: false,
  fog: false,
  uniforms: {
    topColor: { value: new THREE.Color(0x0a1f35) },
    bottomColor: { value: new THREE.Color(0x050910) }
  },
  vertexShader: /* glsl */`
    varying vec3 vDir;
    void main(){
      vDir = normalize(position);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    varying vec3 vDir;
    uniform vec3 topColor;
    uniform vec3 bottomColor;
    void main(){
      float t = smoothstep(-0.2, 0.8, vDir.y);
      vec3 col = mix(bottomColor, topColor, t);
      gl_FragColor = vec4(col, 1.0);
    }
  `
});
const skyMesh = new THREE.Mesh(skyGeo, skyMat);
skyMesh.renderOrder = -2;
skyMesh.frustumCulled = false;
bgScene.add(skyMesh);

// Estrellas
const starCount = 3500;
const starPositions = new Float32Array(starCount * 3);
for (let i = 0; i < starCount; i++) {
  const r = 1400 + Math.random() * 400;
  const a = Math.random() * Math.PI * 2;
  const b = Math.acos(2 * Math.random() - 1);
  starPositions[i*3+0] = r * Math.sin(b) * Math.cos(a);
  starPositions[i*3+1] = r * Math.cos(b);
  starPositions[i*3+2] = r * Math.sin(b) * Math.sin(a);
}
const starGeo = new THREE.BufferGeometry();
starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
const starMat = new THREE.PointsMaterial({
  size: 2.2,
  sizeAttenuation: false,
  color: 0xffffff,
  fog: false,
  depthTest: false,
  transparent: true,
  opacity: 0.95
});
const starField = new THREE.Points(starGeo, starMat);
starField.renderOrder = -1;
starField.matrixAutoUpdate = false;
starField.frustumCulled = false;
bgScene.add(starField);

// Luna
const moonTex = new THREE.TextureLoader().load('https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/moon_1024.jpg');
const moonMat = new THREE.MeshBasicMaterial({ map: moonTex, fog: false, depthTest: false });
const moonMesh = new THREE.Mesh(new THREE.SphereGeometry(12, 48, 48), moonMat);
moonMesh.renderOrder = 1;
moonMesh.frustumCulled = false;
bgScene.add(moonMesh);

// Luz de luna (más rojiza para ambiente de terror)
const moonLight = new THREE.DirectionalLight(0xffb2b2, 1.25);
moonLight.castShadow = true;
moonLight.shadow.mapSize.set(2048, 2048);
moonLight.shadow.camera.near = 0.5;
moonLight.shadow.camera.far = 220;
scene.add(moonLight);

/** ========= MURO ========= */
const wallHeight = 6;
const wallGeo = new THREE.CylinderGeometry(WORLD_RADIUS + 0.5, WORLD_RADIUS + 0.5, wallHeight, 64, 1, true);
const wallMat = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide, fog: false });
const wallMesh = new THREE.Mesh(wallGeo, wallMat);
wallMesh.position.y = wallHeight / 2;
wallMesh.renderOrder = 5;
scene.add(wallMesh);

/** ========= PERLIN NOISE & TERRENO PBR ========= */
function makePerlin(seed = 1337) {
  const p = new Uint8Array(512);
  for (let i=0;i<256;i++) p[i]=i;
  let n,q;
  for (let i=255;i>0;i--) { n = Math.floor((seed = (seed * 16807) % 2147483647) / 2147483647 * (i + 1)); q = p[i]; p[i]=p[n]; p[n]=q; }
  for (let i=0;i<256;i++) p[256+i]=p[i];
  const grad=(h,x,y)=>{ switch(h&3){case 0:return x+y;case 1:return -x+y;case 2:return x-y;default:return -x-y;} };
  const fade=t=>t*t*t*(t*(t*6.-15.)+10.);
  const lerp=(a,b,t)=>a+t*(b-a);
  return function noise(x,y){
    const X=Math.floor(x)&255,Y=Math.floor(y)&255; x-=Math.floor(x); y-=Math.floor(y);
    const u=fade(x), v=fade(y), A=p[X]+Y, B=p[X+1]+Y;
    return lerp( lerp(grad(p[A],x,y), grad(p[B],x-1.,y), u),
                 lerp(grad(p[A+1],x,y-1.), grad(p[B+1],x-1.,y-1.), u), v );
  };
}
const noise2D = makePerlin(2025);

const terrainGeo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, TERRAIN_RES, TERRAIN_RES);
terrainGeo.rotateX(-Math.PI / 2);
const tPos = terrainGeo.attributes.position;
for (let i=0;i<tPos.count;i++){
  const x=tPos.getX(i), z=tPos.getZ(i);
  const h = noise2D(x*0.02, z*0.02)*0.6 + noise2D(x*0.05, z*0.05)*0.25 + noise2D(x*0.1, z*0.1)*0.1;
  tPos.setY(i, h*TERRAIN_MAX_H);
}
tPos.needsUpdate = true;
terrainGeo.computeVertexNormals();
terrainGeo.setAttribute('uv2', new THREE.BufferAttribute(new Float32Array(terrainGeo.attributes.uv.array), 2));

const texLoader = new THREE.TextureLoader();
function loadTex(path){
  const tex = texLoader.load(path);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8,8);
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy?.() || 8;
  return tex;
}
const groundColor = loadTex('assets/textures/ground/ground_color.jpg');
const groundNormal = loadTex('assets/textures/ground/ground_normal.jpg');
const groundRough = loadTex('assets/textures/ground/ground_roughness.jpg');
const groundAO = loadTex('assets/textures/ground/ground_ao.jpg');

const terrainMat = new THREE.MeshStandardMaterial({
  color: new THREE.Color(0x3a2a1c),
  map: groundColor,
  normalMap: groundNormal,
  roughnessMap: groundRough,
  aoMap: groundAO,
  roughness: 1.0,
  metalness: 0.0
});
const terrain = new THREE.Mesh(terrainGeo, terrainMat);
terrain.receiveShadow = true;
scene.add(terrain);

/** ========= RAYCAST / UTIL ========= */
const raycaster = new THREE.Raycaster();
function getTerrainHitRay(origin, dir, far=500){
  raycaster.set(origin, dir); raycaster.far = far;
  const hit = raycaster.intersectObject(terrain, false)[0];
  return hit || null;
}
function getTerrainHeight(x, z) {
  const hit = getTerrainHitRay(new THREE.Vector3(x, 100, z), new THREE.Vector3(0,-1,0));
  return hit ? hit.point.y : 0;
}
function clampToWorld(v){
  const r = Math.hypot(v.x, v.z);
  if (r > WORLD_RADIUS - PLAYER_RADIUS){
    const ang = Math.atan2(v.z, v.x);
    const rr = WORLD_RADIUS - PLAYER_RADIUS;
    v.x = Math.cos(ang) * rr; v.z = Math.sin(ang) * rr;
  }
  return v;
}

/** ========= ÁRBOLES ========= */
const treeColliders = [];
function addTree(x, z, scale=1){
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12*scale, 0.22*scale, 2.6*scale, 8),
    new THREE.MeshStandardMaterial({ color: 0x3a2b1a, roughness: 1 })
  );
  trunk.castShadow = true; trunk.receiveShadow = true;

  const crowns = new THREE.Group();
  const levels = 3 + Math.floor(Math.random()*2);
  for(let i=0;i<levels;i++){
    const crown = new THREE.Mesh(
      new THREE.ConeGeometry((1.6-i*0.25)*scale, (2.2-i*0.25)*scale, 10),
      new THREE.MeshStandardMaterial({ color: 0x0f2d1c, roughness: 0.9 })
    );
    crown.castShadow = true; crown.position.y = (2.0 + i*0.7)*scale;
    crowns.add(crown);
  }

  const y = getTerrainHeight(x,z);
  const tree = new THREE.Group();
  tree.position.set(x, y, z);
  tree.add(trunk, crowns);
  scene.add(tree);

  treeColliders.push({ x, z, r: OBJ_TREE_R * scale });
}
for (let i=0;i<TREE_COUNT;i++){
  let x=(Math.random()-0.5)*WORLD_SIZE, z=(Math.random()-0.5)*WORLD_SIZE;
  if (Math.hypot(x-player.position.x, z-player.position.z) < 6){
    const a=Math.random()*Math.PI*2, r=8+Math.random()*20;
    x=player.position.x+Math.cos(a)*r; z=player.position.z+Math.sin(a)*r;
  }
  addTree(x, z, 0.8 + Math.random()*1.8);
}

/** ========= AUDIO ========= */
const listener = new THREE.AudioListener();
camera.add(listener);
const audioLoader = new THREE.AudioLoader();

let zombieGroanBuffer = null;
let zombieDieBuffer = null;
let playerHitBuffer = null;
let windBuffer = null;

audioLoader.load('assets/audio/zombie_groan.mp3', (buf)=> zombieGroanBuffer = buf);
audioLoader.load('assets/audio/zombie_die.mp3', (buf)=> zombieDieBuffer = buf);
audioLoader.load('assets/audio/player_hit.mp3', (buf)=> playerHitBuffer = buf);
audioLoader.load('assets/audio/wind.mp3', (buf)=> windBuffer = buf);

let windSfx = null;
function startAmbientAudio(){
  const ctx = listener.context;
  if (ambientEl) {
    try {
      const srcNode = ctx.createMediaElementSource(ambientEl);
      srcNode.connect(listener.getInput());
      ambientEl.loop = true;
      ambientEl.volume = 0.4;
      ambientEl.play().catch(()=>{});
    } catch {}
  }
  if (windBuffer && !windSfx) {
    windSfx = new THREE.Audio(listener);
    windSfx.setBuffer(windBuffer);
    windSfx.setLoop(true);
    windSfx.setVolume(0.28);
    windSfx.play();
  }
}

function playZombieGroan(position) {
  if (!zombieGroanBuffer) return;
  const groan = new THREE.PositionalAudio(listener);
  groan.setBuffer(zombieGroanBuffer);
  groan.setRefDistance(10);
  groan.setVolume(Math.random() * 0.3 + 0.2);
  groan.setLoop(false);
  
  // Posicionar el sonido cerca del zombi
  const soundPos = position.clone();
  const audioObj = new THREE.Object3D();
  audioObj.position.copy(soundPos);
  scene.add(audioObj);
  audioObj.add(groan);
  
  groan.play();
  
  // Limpiar después de reproducir
  groan.onEnded = () => {
    audioObj.remove(groan);
    scene.remove(audioObj);
  };
}

/** ========= ZOMBIS + SISTEMA DE PARTÍCULAS ========= */
const zombies = [];
const zombieColliders = [];

// Textura para ojos brillantes
function createEyeTexture(size=64) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  
  // Fondo negro
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, size, size);
  
  // Ojo rojo brillante
  const gradient = ctx.createRadialGradient(
    size/2, size/2, 0,
    size/2, size/2, size/2
  );
  gradient.addColorStop(0, '#ff0000');
  gradient.addColorStop(0.5, '#880000');
  gradient.addColorStop(1, '#000000');
  
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(size/2, size/2, size/2, 0, Math.PI * 2);
  ctx.fill();
  
  // Punto blanco para brillo
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(size/2 - size/4, size/2 - size/4, size/8, 0, Math.PI * 2);
  ctx.fill();
  
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

// Sistema de partículas para sangre
const particleSystems = [];
function spawnBloodParticles(pos){
  const COUNT = 120;
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(COUNT*3);
  const velocities = new Float32Array(COUNT*3);
  const colors = new Float32Array(COUNT*3);
  const life = new Float32Array(COUNT);

  for (let i=0;i<COUNT;i++){
    const i3 = i*3;
    positions[i3+0] = pos.x;
    positions[i3+1] = pos.y + 0.5;
    positions[i3+2] = pos.z;

    const u = Math.random();
    const v = Math.random();
    const theta = 2*Math.PI*u;
    const phi = Math.acos(2*v - 1);
    const dir = new THREE.Vector3(
      Math.sin(phi)*Math.cos(theta),
      Math.cos(phi),
      Math.sin(phi)*Math.sin(theta)
    );
    const speed = 3.0 + Math.random()*5.0;
    velocities[i3+0] = dir.x*speed;
    velocities[i3+1] = dir.y*speed;
    velocities[i3+2] = dir.z*speed;

    // Colores de sangre
    const bloodRed = new THREE.Color().setHSL(0, 0.9, 0.3);
    const bloodDark = new THREE.Color().setHSL(0, 0.9, 0.2);
    const bloodColor = Math.random() > 0.7 ? bloodDark : bloodRed;
    
    colors[i3+0] = bloodColor.r;
    colors[i3+1] = bloodColor.g;
    colors[i3+2] = bloodColor.b;

    life[i] = 1.5 + Math.random()*1.0;
  }

  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('life', new THREE.BufferAttribute(life, 1));

  const mat = new THREE.PointsMaterial({
    size: 0.15,
    vertexColors: true,
    transparent: true,
    opacity: 1.0,
    fog: false,
    depthTest: true,
    blending: THREE.NormalBlending
  });

  const points = new THREE.Points(geo, mat);
  points.userData = { age: 0, geo, mat };
  scene.add(points);
  particleSystems.push(points);
}

function updateParticles(dt){
  for (let i=particleSystems.length-1;i>=0;i--){
    const ps = particleSystems[i];
    ps.userData.age += dt;
    const geo = ps.userData.geo;
    const pos = geo.getAttribute('position');
    const vel = geo.getAttribute('velocity');
    const life = geo.getAttribute('life');
    const count = life.count;

    for (let j=0;j<count;j++){
      const idx = j*3;
      vel.array[idx+1] -= 9.8 * dt;
      pos.array[idx+0] += vel.array[idx+0]*dt;
      pos.array[idx+1] += vel.array[idx+1]*dt;
      pos.array[idx+2] += vel.array[idx+2]*dt;
    }
    pos.needsUpdate = true;

    const L = 2.5;
    const alpha = Math.max(0, 1.0 - (ps.userData.age / L));
    ps.userData.mat.opacity = alpha;

    if (ps.userData.age > L){
      scene.remove(ps);
      ps.geometry.dispose();
      ps.material.dispose();
      particleSystems.splice(i,1);
    }
  }
}

// Crear un zombi
function addZombie(x, z) {
  const y = getTerrainHeight(x, z);
  
  // Materiales
  const skinMaterial = new THREE.MeshStandardMaterial({
    color: 0x4a7a4a,
    roughness: 0.9,
    metalness: 0.0
  });
  
  const clothesMaterial = new THREE.MeshStandardMaterial({
    color: 0x2a2a2a,
    roughness: 0.8,
    metalness: 0.0
  });
  
  const eyeMaterial = new THREE.MeshBasicMaterial({
    color: 0xff0000,
    emissive: 0xff0000,
    emissiveIntensity: 0.5
  });

  // Grupo principal del zombi
  const zombie = new THREE.Group();
  zombie.position.set(x, y, z);
  
  // Cuerpo
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.4, 0.5, 1.2, 8),
    clothesMaterial
  );
  body.position.y = 0.6;
  body.castShadow = true;
  
  // Cabeza
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.5, 0.5),
    skinMaterial
  );
  head.position.y = 1.4;
  head.castShadow = true;
  
  // Ojos
  const eyeGeometry = new THREE.SphereGeometry(0.06, 8, 8);
  const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
  const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
  leftEye.position.set(-0.15, 1.45, 0.25);
  rightEye.position.set(0.15, 1.45, 0.25);
  
  // Brazos
  const armGeometry = new THREE.CylinderGeometry(0.08, 0.1, 0.7, 6);
  const leftArm = new THREE.Mesh(armGeometry, skinMaterial);
  const rightArm = new THREE.Mesh(armGeometry, skinMaterial);
  leftArm.position.set(-0.45, 0.8, 0);
  rightArm.position.set(0.45, 0.8, 0);
  leftArm.rotation.z = Math.PI / 6;
  rightArm.rotation.z = -Math.PI / 6;
  
  // Piernas
  const legGeometry = new THREE.CylinderGeometry(0.12, 0.15, 0.8, 6);
  const leftLeg = new THREE.Mesh(legGeometry, clothesMaterial);
  const rightLeg = new THREE.Mesh(legGeometry, clothesMaterial);
  leftLeg.position.set(-0.2, 0.0, 0);
  rightLeg.position.set(0.2, 0.0, 0);
  
  // Añadir todas las partes
  zombie.add(body, head, leftEye, rightEye, leftArm, rightArm, leftLeg, rightLeg);
  
  // Configuración del zombi
  zombie.userData = {
    speed: ZOMBIE_SPEED_MIN + Math.random() * (ZOMBIE_SPEED_MAX - ZOMBIE_SPEED_MIN),
    target: null,
    state: 'idle', // idle, chasing, attacking
    lastAttackTime: 0,
    health: 100,
    isDead: false,
    groanTimer: Math.random() * 5,
    materials: { skinMaterial, clothesMaterial, eyeMaterial }
  };
  
  // Animación de caminar
  zombie.userData.animate = (dt) => {
    if (zombie.userData.isDead) return;
    
    // Temporizador para gemidos
    zombie.userData.groanTimer -= dt;
    if (zombie.userData.groanTimer <= 0) {
      playZombieGroan(zombie.position);
      zombie.userData.groanTimer = 5 + Math.random() * 10;
    }
    
    // Oscilación de brazos al caminar
    const time = performance.now() * 0.001;
    leftArm.rotation.z = Math.PI / 6 + Math.sin(time * 3) * 0.2;
    rightArm.rotation.z = -Math.PI / 6 + Math.sin(time * 3 + Math.PI) * 0.2;
    
    // Parpadeo de ojos
    const blink = Math.sin(time * 2) > 0.5 ? 1 : 0.3;
    eyeMaterial.emissiveIntensity = blink * 0.5;
  };
  
  scene.add(zombie);
  zombies.push(zombie);
  zombieColliders.push({ 
    x, z, 
    r: OBJ_ZOMBIE_R, 
    idx: zombies.length - 1,
    zombie: zombie
  });
  
  return zombie;
}

// Crear zombis alrededor del jugador
for (let i=0; i<ZOMBIE_COUNT; i++) {
  const angle = (i / ZOMBIE_COUNT) * Math.PI * 2;
  const radius = 15 + Math.random() * ZOMBIE_AREA;
  const x = Math.cos(angle) * radius + (Math.random()-0.5)*10;
  const z = Math.sin(angle) * radius + (Math.random()-0.5)*10;
  addZombie(x, z);
}

if (hudTotal) hudTotal.textContent = String(ZOMBIE_COUNT);
if (hudHealth) hudHealth.textContent = String(playerHealth);

/** ========= TUMBAS ========= */
const graveColliders = [];
const stoneTex = loadTex('assets/textures/stone/stone_diffuse.jpg');
function addGrave(x, z){
  const y = getTerrainHeight(x, z);
  const stone = new THREE.MeshStandardMaterial({ color: 0xffffff, map: stoneTex, roughness: 1.0, metalness: 0.0 });

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 0.25, 16), stone);
  base.position.set(0, y + 0.125, 0);
  base.castShadow = true; base.receiveShadow = true;

  const vertical = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.2, 0.15), stone);
  vertical.position.set(0, y + 0.25 + 0.6, 0);
  vertical.castShadow = true; vertical.receiveShadow = true;

  const horizontal = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.25, 0.15), stone);
  horizontal.position.set(0, y + 0.25 + 0.75, 0);
  horizontal.castShadow = true; horizontal.receiveShadow = true;

  const chipGeo = new THREE.BoxGeometry(0.08, 0.12, 0.16);
  const chip1 = new THREE.Mesh(chipGeo, stone); chip1.position.set(0.18, y + 0.25 + 0.2, 0.08);
  const chip2 = new THREE.Mesh(chipGeo, stone); chip2.position.set(-0.2, y + 0.25 + 0.95, -0.07);

  const group = new THREE.Group();
  group.add(base, vertical, horizontal, chip1, chip2);
  group.position.set(x, 0, z);
  group.rotation.y = (Math.random()-0.5)*0.6;
  group.rotation.z = (Math.random()-0.5)*0.05;
  const s = 0.9 + Math.random()*0.3;
  group.scale.setScalar(s);

  scene.add(group);
  graveColliders.push({ x, z, r: OBJ_GRAVE_R * s });
}
for (let i=0;i<GRAVE_COUNT;i++){
  const angle = (i / GRAVE_COUNT) * Math.PI * 2 + Math.random()*0.4;
  const radius = 15 + Math.random() * 60;
  const x = Math.cos(angle) * radius;
  const z = Math.sin(angle) * radius;
  addGrave(x, z);
}

/** ========= SISTEMA DE COMBATE ========= */
function damageZombie(zombie) {
  if (zombie.userData.isDead) return;
  
  zombie.userData.health -= 50;
  
  if (zombie.userData.health <= 0) {
    // Zombi muere
    zombie.userData.isDead = true;
    
    // Efecto visual de muerte
    zombie.userData.materials.skinMaterial.color.set(0x2a2a2a);
    zombie.userData.materials.clothesMaterial.color.set(0x1a1a1a);
    zombie.userData.materials.eyeMaterial.emissiveIntensity = 0;
    
    // Partículas de sangre
    spawnBloodParticles(zombie.position.clone());
    
    // Sonido de muerte
    if (zombieDieBuffer) {
      const dieSound = new THREE.PositionalAudio(listener);
      dieSound.setBuffer(zombieDieBuffer);
      dieSound.setRefDistance(10);
      dieSound.setVolume(0.6);
      const soundObj = new THREE.Object3D();
      soundObj.position.copy(zombie.position);
      scene.add(soundObj);
      soundObj.add(dieSound);
      dieSound.play();
      dieSound.onEnded = () => {
        soundObj.remove(dieSound);
        scene.remove(soundObj);
      };
    }
    
    // Actualizar contador
    hitCount++;
    if (hudHit) hudHit.textContent = String(hitCount);
  } else {
    // Zombi herido
    spawnBloodParticles(zombie.position.clone());
  }
}

function damagePlayer(amount) {
  if (gameOver) return;
  
  playerHealth = Math.max(0, playerHealth - amount);
  if (hudHealth) hudHealth.textContent = String(playerHealth);
  
  // Actualizar UI de salud
  if (healthBadge) {
    if (playerHealth < 30) {
      healthBadge.classList.add('low-health');
    } else {
      healthBadge.classList.remove('low-health');
    }
  }
  
  // Sonido de daño
  if (playerHitBuffer && playerHealth > 0) {
    const hitSound = new THREE.Audio(listener);
    hitSound.setBuffer(playerHitBuffer);
    hitSound.setVolume(0.7);
    hitSound.play();
  }
  
  // Verificar game over
  if (playerHealth <= 0) {
    gameOver = true;
    showGameOver();
  }
}

function showGameOver() {
  const gameOverDiv = document.createElement('div');
  gameOverDiv.id = 'gameOver';
  gameOverDiv.innerHTML = `
    <h2>¡GAME OVER!</h2>
    <p>Zombis eliminados: ${hitCount}</p>
    <button onclick="location.reload()">Reiniciar</button>
  `;
  document.body.appendChild(gameOverDiv);
  gameOverDiv.style.display = 'block';
}

/** ========= VR: CONTROLADORES + TELEPORT ========= */
const vrBtn = VRButton.createButton(renderer);
vrBtn.classList.add('vr-button');
document.body.appendChild(vrBtn);

const controllerLeft = renderer.xr.getController(0);
const controllerRight = renderer.xr.getController(1);
scene.add(controllerLeft, controllerRight);

const controllerModelFactory = new XRControllerModelFactory();
const grip0 = renderer.xr.getControllerGrip(0);
grip0.add(controllerModelFactory.createControllerModel(grip0));
scene.add(grip0);
const grip1 = renderer.xr.getControllerGrip(1);
grip1.add(controllerModelFactory.createControllerModel(grip1));
scene.add(grip1);

// Sistema de teleport
const arcMatOK = new THREE.LineBasicMaterial({ color: 0x7ad1ff, transparent:true, opacity:0.95 });
const arcMatBAD = new THREE.LineBasicMaterial({ color: 0xff5a5a, transparent:true, opacity:0.95 });
const arcGeo = new THREE.BufferGeometry().setFromPoints(new Array(ARC_STEPS).fill(0).map(()=>new THREE.Vector3()));
const arcLine = new THREE.Line(arcGeo, arcMatOK);
arcLine.visible=false;
scene.add(arcLine);

const marker = new THREE.Mesh(
  new THREE.RingGeometry(0.25,0.30,32),
  new THREE.MeshBasicMaterial({ color:0x7ad1ff, transparent:true, opacity:0.9, side:THREE.DoubleSide })
);
marker.rotation.x = -Math.PI/2;
marker.visible=false;
scene.add(marker);

let teleportValid = false;
const teleportPoint = new THREE.Vector3();

controllerRight.addEventListener('selectstart', ()=>{ arcLine.visible=true; marker.visible=true; });
controllerRight.addEventListener('selectend', ()=>{
  arcLine.visible=false; marker.visible=false;
  if (teleportValid){
    const clamped = clampToWorld(teleportPoint.clone());
    player.position.set(clamped.x, getTerrainHeight(clamped.x, clamped.z) + 1.6, clamped.z);
  }
});

// Sistema de golpe con controladores
controllerLeft.addEventListener('selectstart', () => {
  // Verificar si golpeamos un zombi
  const controllerPos = new THREE.Vector3().setFromMatrixPosition(controllerLeft.matrixWorld);
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(controllerLeft.quaternion);
  
  raycaster.set(controllerPos, forward);
  raycaster.far = 2.0;
  
  // Buscar zombis cerca
  for (const zombie of zombies) {
    if (zombie.userData.isDead) continue;
    
    const distance = zombie.position.distanceTo(controllerPos);
    if (distance < 2.0) {
      // Verificar dirección
      const toZombie = new THREE.Vector3().subVectors(zombie.position, controllerPos).normalize();
      const dot = forward.dot(toZombie);
      
      if (dot > 0.7) { // Está frente a nosotros
        damageZombie(zombie);
        break;
      }
    }
  }
});

renderer.xr.addEventListener('sessionstart', async ()=>{
  try { if (ambientEl) { ambientEl.volume = 0.4; await ambientEl.play(); } } catch(e){ console.warn('Audio bosque bloqueado:', e); }
  startAmbientAudio();
});

/** ========= LOCOMOCIÓN ========= */
function vrGamepadMove(dt){
  const session = renderer.xr.getSession(); if (!session) return;
  for (const src of session.inputSources){
    if (!src.gamepad) continue;
    let [x,y] = [src.gamepad.axes[2], src.gamepad.axes[3]];
    if (x===undefined || y===undefined){ x = src.gamepad.axes[0] ?? 0; y = src.gamepad.axes[1] ?? 0; }
    const dead=0.12; if (Math.abs(x)<dead) x=0; if (Math.abs(y)<dead) y=0; if (x===0 && y===0) continue;

    const forward = new THREE.Vector3(); camera.getWorldDirection(forward); forward.y=0; forward.normalize();
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0,1,0)).normalize();

    let next = player.position.clone();
    next.addScaledVector(forward, -y * VR_WALK_SPEED * dt);
    next.addScaledVector(right, x * VR_STRAFE_SPEED * dt);

    next = clampToWorld(next);
    next.y = getTerrainHeight(next.x, next.z) + 1.6;
    next = resolveCollisions(player.position, next);
    player.position.copy(next);
  }
}

/** ========= TELEPORT ========= */
const arcPointsBuf = new Float32Array(ARC_STEPS*3);
function segmentIntersectTerrain(a,b){
  const dir = new THREE.Vector3().subVectors(b,a);
  const len = dir.length(); if (!len) return null; dir.normalize();
  raycaster.set(a, dir); raycaster.far = len + 0.01;
  const h = raycaster.intersectObject(terrain, false)[0];
  if (!h) return null;
  const n = h.face?.normal.clone() || new THREE.Vector3(0,1,0);
  n.transformDirection(terrain.matrixWorld);
  return { point: h.point.clone(), faceNormal: n.normalize() };
}
function updateTeleportArc(){
  if (!arcLine.visible) return;
  teleportValid = false;

  const origin = new THREE.Vector3().setFromMatrixPosition(controllerRight.matrixWorld);
  const dir = new THREE.Vector3(0,0,-1).applyQuaternion(controllerRight.quaternion).normalize();

  const pts = [];
  let hit = null;
  const v0 = dir.clone().multiplyScalar(ARC_SPEED);
  const g = new THREE.Vector3(0,-ARC_GRAVITY,0);
  let p = origin.clone(), v = v0.clone();

  for (let i=0;i<ARC_STEPS;i++){
    pts.push(p.clone());
    v.addScaledVector(g, 1/60);
    const np = p.clone().addScaledVector(v, 1/60);
    const segHit = segmentIntersectTerrain(p, np);
    if (segHit){ hit = segHit; break; }
    p.copy(np);
  }

  for (let i=0;i<ARC_STEPS;i++){
    const P = pts[Math.min(i, pts.length-1)];
    arcPointsBuf[i*3+0]=P.x; arcPointsBuf[i*3+1]=P.y; arcPointsBuf[i*3+2]=P.z;
  }
  arcGeo.setAttribute('position', new THREE.BufferAttribute(arcPointsBuf,3));
  arcGeo.attributes.position.needsUpdate = true;

  if (hit){
    const slopeDeg = THREE.MathUtils.radToDeg(Math.acos(hit.faceNormal.dot(new THREE.Vector3(0,1,0))));
    const inside = hit.point.distanceTo(new THREE.Vector3(0, hit.point.y, 0)) <= WORLD_RADIUS;
    teleportValid = (slopeDeg <= MAX_SLOPE_DEG) && inside;

    arcLine.material = teleportValid ? arcMatOK : arcMatBAD;
    marker.material.color.set(teleportValid ? 0x7ad1ff : 0xff5a5a);

    const clamped = clampToWorld(hit.point.clone());
    marker.position.set(clamped.x, getTerrainHeight(clamped.x, clamped.z) + 0.02, clamped.z);
    teleportPoint.copy(clamped);
  }
}

/** ========= IA DE ZOMBIS ========= */
function updateZombiesAI(dt) {
  const currentTime = performance.now() * 0.001;
  
  for (const zombie of zombies) {
    if (zombie.userData.isDead) continue;
    
    const distanceToPlayer = zombie.position.distanceTo(player.position);
    
    // Actualizar estado
    if (distanceToPlayer < ZOMBIE_DETECTION_RANGE) {
      zombie.userData.state = 'chasing';
      zombie.userData.target = player.position.clone();
    } else {
      zombie.userData.state = 'idle';
      zombie.userData.target = null;
    }
    
    // Comportamiento según estado
    if (zombie.userData.state === 'chasing' && zombie.userData.target) {
      // Moverse hacia el jugador
      const direction = new THREE.Vector3()
        .subVectors(zombie.userData.target, zombie.position)
        .normalize();
      
      // Mantener en el terreno
      const nextX = zombie.position.x + direction.x * zombie.userData.speed * dt;
      const nextZ = zombie.position.z + direction.z * zombie.userData.speed * dt;
      const nextY = getTerrainHeight(nextX, nextZ);
      
      // Rotar hacia el jugador
      zombie.lookAt(
        player.position.x,
        zombie.position.y,
        player.position.z
      );
      
      // Mover el zombi
      zombie.position.x = nextX;
      zombie.position.z = nextZ;
      zombie.position.y = nextY;
      
      // Atacar si está suficientemente cerca
      if (distanceToPlayer < ZOMBIE_ATTACK_RANGE) {
        if (currentTime - zombie.userData.lastAttackTime > ZOMBIE_ATTACK_COOLDOWN) {
          damagePlayer(ZOMBIE_ATTACK_DAMAGE);
          zombie.userData.lastAttackTime = currentTime;
        }
      }
    }
    
    // Animación
    if (zombie.userData.animate) {
      zombie.userData.animate(dt);
    }
  }
}

/** ========= COLISIONES ========= */
let hitCount = 0;
function resolveCollisions(curr, next){
  // Árboles
  for (const t of treeColliders){
    const dx = next.x - t.x, dz = next.z - t.z;
    const dist = Math.hypot(dx, dz);
    const minD = PLAYER_RADIUS + t.r;
    if (dist < minD){
      const push = (minD - dist) + 1e-3;
      const nx = dx / (dist || 1), nz = dz / (dist || 1);
      next.x += nx * push; next.z += nz * push;
    }
  }
  // Tumbas
  for (const g of graveColliders){
    const dx = next.x - g.x, dz = next.z - g.z;
    const dist = Math.hypot(dx, dz);
    const minD = PLAYER_RADIUS + g.r;
    if (dist < minD){
      const push = (minD - dist) + 1e-3;
      const nx = dx / (dist || 1), nz = dz / (dist || 1);
      next.x += nx * push; next.z += nz * push;
    }
  }
  // Zombis
  for (const z of zombieColliders){
    if (zombies[z.idx].userData.isDead) continue;
    
    const dx = next.x - z.x, dz = next.z - z.z;
    const dist = Math.hypot(dx, dz);
    const minD = PLAYER_RADIUS + z.r;
    if (dist < minD){
      const push = (minD - dist) + 1e-3;
      const nx = dx / (dist || 1), nz = dz / (dist || 1);
      next.x += nx * push; next.z += nz * push;
    }
  }
  return clampToWorld(next);
}

/** ========= LOOP PRINCIPAL ========= */
const clock = new THREE.Clock();
renderer.setAnimationLoop(()=>{
  const dt = Math.min(clock.getDelta(), 0.05);

  if (!gameOver) {
    if (renderer.xr.isPresenting){
      vrGamepadMove(dt);
      updateTeleportArc();
    }
    
    // Actualizar IA de zombis
    updateZombiesAI(dt);
  }

  // Mantener el fondo centrado
  const p = player.position;
  skyMesh.position.copy(p);
  starField.position.copy(p);

  // Posicionar luna
  const moonOffset = new THREE.Vector3(0, 140, -120);
  moonMesh.position.copy(p).add(moonOffset);
  moonLight.position.copy(moonMesh.position.clone().normalize().multiplyScalar(60));

  // Actualizar partículas
  updateParticles(dt);

  // Renderizar
  renderer.clear();
  bgCam.projectionMatrix.copy(camera.projectionMatrix);
  bgCam.matrixWorld.copy(camera.matrixWorld);
  bgCam.matrixWorldInverse.copy(camera.matrixWorldInverse);
  renderer.render(bgScene, bgCam);
  renderer.render(scene, camera);
});

/** ========= RESIZE ========= */
addEventListener('resize', ()=>{
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// Cargar sonidos adicionales para zombis
setTimeout(() => {
  if (zombieGroanEl) {
    zombieGroanEl.src = 'assets/audio/zombie_groan.mp3';
    zombieGroanEl.load();
  }
}, 1000);