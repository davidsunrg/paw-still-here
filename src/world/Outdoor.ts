import * as THREE from 'three';
import { CONFIG, RIVER_BANKS, ZONES } from '../config';
import { mulberry32 } from '../data/pets';
import { STR } from '../strings';
import { Instancer } from './Kit';
import { textMesh } from './textures';
import type { World } from './World';

function curveX(z: number) {
  const k = THREE.MathUtils.smoothstep(z, 2, 14);
  return 2.6 * Math.sin(z * 0.13) * k;
}

/** 石头路中心线：略带弯曲，靠近大门时收直；过河的一段也收直，好让桥正对着路 */
export function pathX(z: number) {
  const rz = CONFIG.river.z;
  const straight = 1 - THREE.MathUtils.smoothstep(Math.abs(z - rz), 3.6, 8);
  return THREE.MathUtils.lerp(curveX(z), curveX(rz), straight);
}

/** 桥的中心线，以及码头的中心线 */
export const BRIDGE_X = pathX(CONFIG.river.z);
export const DOCK_X = BRIDGE_X + CONFIG.river.dock.offsetX;

/** z 是否落在河道（含岸坡）范围内，margin 是额外留出的距离 */
export function inRiver(z: number, margin = 0) {
  return z > RIVER_BANKS.north - margin && z < RIVER_BANKS.south + margin;
}

/** 把落在河道附近的东西挪到最近的岸上 */
function clearOfRiver(z: number, margin: number) {
  if (!inRiver(z, margin)) return z;
  return z < CONFIG.river.z ? RIVER_BANKS.north - margin : RIVER_BANKS.south + margin;
}

/** 是否挡在通往码头的路上 */
function nearDock(x: number, z: number) {
  return Math.abs(x - DOCK_X) < 2.2 && z > RIVER_BANKS.south - 0.5 && z < RIVER_BANKS.south + 3.5;
}

function swayMaterial(uTime: { value: number }) {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader =
      'uniform float uTime;\n' +
      sh.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          float swayPh = instanceMatrix[3][0] * 0.35 + instanceMatrix[3][2] * 0.27;
          transformed.x += sin(uTime * 1.1 + swayPh) * 0.05 * (position.y + 0.3);
          transformed.z += cos(uTime * 0.8 + swayPh * 1.3) * 0.04 * (position.y + 0.3);
        #endif`,
      );
  };
  return m;
}

export function buildOutdoor(w: World) {
  const { kit, scene } = w;
  const C = CONFIG.colors;
  const rnd = mulberry32(7);
  const R = (a: number, b: number) => a + rnd() * (b - a);

  // ---------- 草地与远山 ----------
  // 草地在河道处断开，分成南北两块，中间的河床和水面由 River.ts 搭建
  const groundMat = new THREE.MeshStandardMaterial({ color: C.ground, roughness: 1 });
  for (const [zMin, zMax] of [[-350, RIVER_BANKS.north], [RIVER_BANKS.south, 350]]) {
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(700, zMax - zMin).rotateX(-Math.PI / 2), groundMat);
    ground.position.z = (zMin + zMax) / 2;
    ground.receiveShadow = true;
    scene.add(ground);
  }

  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + R(-0.15, 0.15);
    const r = R(150, 200);
    kit.ball(Math.cos(a) * r, -4, Math.sin(a) * r - 25, R(45, 80), 0x1c2a44, R(0.3, 0.55), R(0, 6));
  }

  // ---------- 石头路 ----------
  const stoneMat = new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true });
  const stones = new Instancer(new THREE.CylinderGeometry(1, 1.08, 1, 7), stoneMat);
  const half = CONFIG.path.width / 2;
  for (let z = CONFIG.path.startZ; z > 1.9; z -= 0.62) {
    // 桥面那一段不铺石头
    if (Math.abs(z - CONFIG.river.z) < CONFIG.river.bridge.len / 2) continue;
    const cx = pathX(z);
    for (let k = 0; k < 4; k++) {
      const lx = -half + (k + 0.5) * (CONFIG.path.width / 4) + R(-0.14, 0.14);
      const r = R(0.26, 0.4);
      const g = R(0.42, 0.62);
      stones.add(
        cx + lx, 0.03, z + R(-0.14, 0.14),
        r * R(0.85, 1.2), 0.05, r * R(0.85, 1.2),
        new THREE.Color(g, g * 0.98, g * 0.94), 1, R(0, 6),
      );
    }
  }
  stones.build(scene);
  // 门前的石阶
  kit.box(0, 0.05, 1.1, 5.4, 0.1, 2.0, 0x9a968f);

  // ---------- 行道树与路灯 ----------
  const trunkColor = 0x5b4332;
  const coneCanopy = new Instancer(new THREE.ConeGeometry(1, 1, 7).translate(0, 0.5, 0), swayMaterial(w.uTime));
  const ballCanopy = new Instancer(new THREE.IcosahedronGeometry(1, 1), swayMaterial(w.uTime));
  const greens = [0x2f6b4a, 0x3a7a52, 0x27603f, 0x4a8a58];

  const tree = (x: number, z: number, s: number, kind: number) => {
    const g = greens[Math.floor(rnd() * greens.length)];
    if (kind === 0) {
      kit.cyl(x, 0, z, 0.2 * s, 1.6 * s, trunkColor);
      coneCanopy.add(x, 1.2 * s, z, 1.7 * s, 2.4 * s, 1.7 * s, g, 1, R(0, 6));
      coneCanopy.add(x, 2.5 * s, z, 1.35 * s, 2.1 * s, 1.35 * s, g, 1.08, R(0, 6));
      coneCanopy.add(x, 3.7 * s, z, 0.95 * s, 1.8 * s, 0.95 * s, g, 1.16, R(0, 6));
    } else {
      kit.cyl(x, 0, z, 0.22 * s, 2.6 * s, trunkColor);
      ballCanopy.add(x, 3.4 * s, z, 1.7 * s, 1.5 * s, 1.7 * s, g, 1, R(0, 6));
      ballCanopy.add(x + 0.9 * s, 2.9 * s, z + 0.3 * s, 1.1 * s, 1.0 * s, 1.1 * s, g, 1.08, R(0, 6));
      ballCanopy.add(x - 0.8 * s, 3.0 * s, z - 0.4 * s, 1.2 * s, 1.0 * s, 1.2 * s, g, 0.94, R(0, 6));
    }
    w.collide(x, z, 0.6 * s, 0.6 * s);
  };

  const lamp = (x: number, z: number) => {
    const dark = 0x2b2b33;
    kit.cyl(x, 0, z, 0.16, 0.3, dark);
    kit.cyl(x, 0, z, 0.06, 3.1, dark);
    kit.box(x, 3.12, z, 0.44, 0.05, 0.44, dark);
    kit.glowBox(x, 3.36, z, 0.3, 0.42, 0.3, C.warm, 3.2);
    kit.cone(x, 3.57, z, 0.36, 0.26, dark);
    kit.pool(x, z, 9, C.warm, 0.3);
    w.collide(x, z, 0.4, 0.4);
  };

  let i = 0;
  for (let z0 = 43; z0 > 6; z0 -= 5.5, i++) {
    // 原本落在河边的树和路灯退到岸上
    const z = clearOfRiver(z0, i % 2 === 1 ? 1.6 : 1.3);
    const cx = pathX(z);
    if (i % 2 === 1) {
      tree(cx - 3.7 + R(-0.3, 0.3), z + R(-0.5, 0.5), R(0.95, 1.25), i % 4 === 0 ? 0 : 1);
      tree(cx + 3.7 + R(-0.3, 0.3), z + R(-0.5, 0.5), R(0.95, 1.25), i % 4 === 0 ? 1 : 0);
    } else {
      lamp(cx - 2.35, z);
      lamp(cx + 2.35, z);
      w.pointLight(cx, 3.3, z, 55, 20);
    }
  }

  // 四周散落的树林
  for (let k = 0; k < 150; k++) {
    const x = R(-95, 95);
    const z = R(ZONES.memBack - 40, 80);
    const nearPath = z > -1 && z < 62 && Math.abs(x - pathX(Math.min(Math.max(z, 0), CONFIG.path.startZ))) < 8.5;
    const inBuilding = z < 3 && z > ZONES.memBack - 4 && Math.abs(x) < (z > ZONES.memFront - 2 ? 15 : 25);
    if (nearPath || inBuilding || inRiver(z, 3.2)) continue;
    tree(x, z, R(0.9, 1.9), rnd() < 0.6 ? 0 : 1);
  }
  coneCanopy.build(scene);
  ballCanopy.build(scene);

  // ---------- 灌木、石头、花草 ----------
  for (let k = 0; k < 46; k++) {
    const z = R(2, 50);
    const side = rnd() < 0.5 ? -1 : 1;
    const x = pathX(z) + side * R(2.6, 9);
    const kind = rnd();
    if (inRiver(z, 0.8) || nearDock(x, z)) continue;
    if (kind < 0.6) kit.ball(x, 0.25, z, R(0.4, 0.8), greens[k % 4], 0.75, R(0, 6));
    else kit.ball(x, 0.1, z, R(0.2, 0.45), 0x77767a, 0.6, R(0, 6));
  }
  const flowerColors = [0xfff2a8, 0xffb7c5, 0xffffff, 0xc9b6ff, 0xffd08a];
  for (let k = 0; k < 520; k++) {
    const z = R(1, 52);
    const side = rnd() < 0.5 ? -1 : 1;
    const x = pathX(z) + side * R(1.75, 10);
    const tall = rnd() < 0.7;
    if (inRiver(z, 0.25) || nearDock(x, z)) continue;
    if (tall) {
      kit.cone(x, 0, z, R(0.04, 0.07), R(0.18, 0.36), rnd() < 0.5 ? 0x4c8a55 : 0x5fa064, R(0, 6));
    } else {
      kit.cone(x, 0, z, 0.02, 0.16, 0x4c8a55);
      kit.ball(x, 0.18, z, R(0.04, 0.065), flowerColors[Math.floor(rnd() * flowerColors.length)]);
    }
  }

  // ---------- 入口木牌 ----------
  const sz = CONFIG.path.startZ - 1.5;
  const sx = pathX(sz) + 3.1;
  const ry = -0.32;
  kit.box(sx - 1.09, 0.9, sz - 0.4, 0.12, 1.8, 0.12, C.woodDark, ry);
  kit.box(sx + 1.09, 0.9, sz + 0.32, 0.12, 1.8, 0.12, C.woodDark, ry);
  kit.box(sx, 1.55, sz, 2.9, 1.15, 0.08, C.wood, ry);
  const title = textMesh(STR.brand, { height: 0.5, color: '#ffd9a0', glow: 1.6 });
  const sub = textMesh(STR.subtitle, { height: 0.24, color: '#f3e3c8' });
  for (const [m, y] of [[title, 1.72], [sub, 1.26]] as const) {
    m.position.set(sx + Math.sin(ry) * 0.05, y, sz + Math.cos(ry) * 0.05);
    m.rotation.y = ry;
    scene.add(m);
  }
  kit.glowBox(sx, 2.2, sz + 0.06, 2.4, 0.03, 0.03, C.warm, 2.5, ry);
  // 碰撞范围比木牌略窄，免得从出生点笔直往前走时被牌子的一角卡住
  w.collide(sx + 0.3, sz, 2.0, 0.9);

  // ---------- 萤火虫 ----------
  const n = 140;
  const pos = new Float32Array(n * 3);
  const phase = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const z = clearOfRiver(R(-2, 54), 0.6);
    pos.set([pathX(Math.max(z, 0)) + R(-11, 11), R(0.4, 2.8), z], k * 3);
    phase[k] = R(0, 100);
  }
  const fg = new THREE.BufferGeometry();
  fg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  fg.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  const fireflies = new THREE.Points(
    fg,
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: w.uTime, uScale: { value: 1 } },
      vertexShader: /* glsl */ `
        attribute float aPhase; uniform float uTime; uniform float uScale; varying float vA;
        void main() {
          vec3 p = position;
          p.x += sin(uTime * 0.31 + aPhase) * 1.4 + sin(uTime * 0.83 + aPhase * 2.1) * 0.4;
          p.y += sin(uTime * 0.47 + aPhase * 1.7) * 0.5;
          p.z += cos(uTime * 0.27 + aPhase * 1.3) * 1.4;
          vA = 0.35 + 0.65 * pow(0.5 + 0.5 * sin(uTime * 1.6 + aPhase * 3.0), 2.0);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = uScale * 46.0 / max(1.0, -mv.z);
        }`,
      fragmentShader: /* glsl */ `
        varying float vA;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d);
          gl_FragColor = vec4(vec3(1.9, 2.2, 0.8) * a * a * vA, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }),
  );
  fireflies.frustumCulled = false;
  scene.add(fireflies);
}
