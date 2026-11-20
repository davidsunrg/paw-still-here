import * as THREE from 'three';
import type { OfferKind } from '../data/store';

/**
 * 礼物的小模型：花、蜡烛、零食、玩具、信。
 * 和 Kit 一样用 方块 / 圆柱 / 圆锥 / 球 拼成，几何体和材质全部共用。
 * 所有模型都以底面中心为原点。
 */

const GEO = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 12).translate(0, 0.5, 0),
  cone: new THREE.ConeGeometry(1, 1, 7).translate(0, 0.5, 0),
  ball: new THREE.IcosahedronGeometry(1, 1),
  smooth: new THREE.SphereGeometry(1, 12, 9),
  ring: new THREE.TorusGeometry(1, 0.09, 5, 16),
};

const mats = new Map<number, THREE.MeshStandardMaterial>();
function mat(color: number) {
  let m = mats.get(color);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true });
    mats.set(color, m);
  }
  return m;
}

const FLAME = new THREE.Color(0xffb45a);
/** 柜子远景里的烛火很小，需要更亮才看得见；小龛里是近看，太亮会糊成一团光 */
const FAR_GLOW = 3.2;
const NEAR_GLOW = 1.5;
const flameMat = new THREE.MeshBasicMaterial();
const nearFlameMat = new THREE.MeshBasicMaterial();

/** 烛火统一轻微闪烁 */
export function tickFlames(t: number) {
  const f = 0.88 + 0.12 * Math.sin(t * 9.1) * Math.sin(t * 5.3 + 1.2);
  flameMat.color.copy(FLAME).multiplyScalar(FAR_GLOW * f);
  nearFlameMat.color.copy(FLAME).multiplyScalar(NEAR_GLOW * f);
}
tickFlames(0);

function part(
  geo: THREE.BufferGeometry, material: THREE.Material,
  x: number, y: number, z: number,
  sx: number, sy: number, sz: number,
  rx = 0, ry = 0, rz = 0,
) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  m.rotation.set(rx, ry, rz);
  return m;
}

function group(...parts: THREE.Object3D[]) {
  const g = new THREE.Group();
  g.add(...parts);
  return g;
}

const FLOWER_COLORS = [0xffb7c5, 0xfff2a8, 0xffffff, 0xc9b6ff, 0xff9db0];
const LABEL_COLORS = [0xe07a5f, 0x6fa8c9, 0x8fbf7a];
const TOY_COLORS = [0xff7a6b, 0x6bb8ff, 0xffd15c, 0x8fe08a];
const YARN_COLORS: Array<[number, number]> = [[0xe58fa5, 0xc76f88], [0x8fb8e5, 0x6c95c4], [0xf0c36a, 0xcf9f45]];

/** 一枝花：茎 + 花朵 */
export function flowerStem(v: number, h = 0.22) {
  return group(
    part(GEO.cyl, mat(0x4f8a4a), 0, 0, 0, 0.004, h, 0.004),
    part(GEO.ball, mat(FLOWER_COLORS[v % FLOWER_COLORS.length]), 0, h, 0, 0.034, 0.028, 0.034),
    part(GEO.ball, mat(0xf2c14e), 0, h + 0.014, 0, 0.013, 0.01, 0.013),
  );
}

export function vase() {
  return group(
    part(GEO.cyl, mat(0xd9d2c5), 0, 0, 0, 0.044, 0.1, 0.044),
    part(GEO.cyl, mat(0xc5bcab), 0, 0.1, 0, 0.032, 0.016, 0.032),
  );
}

export function candle(v: number) {
  const h = [0.09, 0.12, 0.15][v % 3];
  return group(
    part(GEO.cyl, mat(0xb08d57), 0, 0, 0, 0.037, 0.006, 0.037),
    part(GEO.cyl, mat(0xf6ecd8), 0, 0.006, 0, 0.021, h, 0.021),
    part(GEO.cyl, mat(0x3a2f2a), 0, h + 0.006, 0, 0.002, 0.008, 0.002),
    part(GEO.smooth, nearFlameMat, 0, h + 0.034, 0, 0.012, 0.026, 0.012),
  );
}

/** 零食：0 罐头，1 小鱼干，2 骨头 */
export function snack(v: number, i = 0) {
  switch (v % 3) {
    case 0:
      return group(
        part(GEO.cyl, mat(0xb9bcc2), 0, 0, 0, 0.042, 0.05, 0.042),
        part(GEO.cyl, mat(LABEL_COLORS[i % LABEL_COLORS.length]), 0, 0.01, 0, 0.0435, 0.03, 0.0435),
        part(GEO.cyl, mat(0xdcdee2), 0, 0.05, 0, 0.036, 0.004, 0.036),
      );
    case 1:
      return group(
        part(GEO.cyl, mat(0xf2efe8), 0, 0, 0, 0.068, 0.008, 0.068),
        part(GEO.smooth, mat(0xc9a56a), 0.01, 0.021, 0, 0.044, 0.013, 0.02),
        part(GEO.cone, mat(0xb8935a), -0.058, 0.021, 0, 0.005, 0.03, 0.022, 0, 0, -Math.PI / 2),
        part(GEO.smooth, mat(0x2a2320), 0.037, 0.026, 0.012, 0.004, 0.004, 0.004),
      );
    default: {
      const bone = mat(0xf3ead8);
      const g = group(part(GEO.cyl, bone, -0.036, 0.016, 0, 0.009, 0.072, 0.009, 0, 0, -Math.PI / 2));
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) g.add(part(GEO.ball, bone, sx * 0.038, 0.016, sz * 0.011, 0.015, 0.015, 0.015));
      }
      return g;
    }
  }
}

/** 玩具：0 小球，1 毛线团 */
export function toy(v: number, i = 0) {
  if (v % 2 === 0) {
    const r = 0.047;
    return group(
      part(GEO.ball, mat(TOY_COLORS[i % TOY_COLORS.length]), 0, r, 0, r, r, r),
      part(GEO.ring, mat(0xfdf6e8), 0, r, 0, r * 1.0, r * 1.0, r * 1.0, Math.PI / 2, 0, 0.35),
    );
  }
  const [c, dark] = YARN_COLORS[i % YARN_COLORS.length];
  const r = 0.05;
  return group(
    part(GEO.smooth, mat(c), 0, r, 0, r, r, r),
    part(GEO.ring, mat(dark), 0, r, 0, r, r, r, 0.5, 0, 0.3),
    part(GEO.ring, mat(dark), 0, r, 0, r, r, r, 1.4, 0.5, 0),
    part(GEO.ring, mat(dark), 0, r, 0, r, r, r, -0.5, 1.2, 0.9),
    part(GEO.cyl, mat(c), 0.04, 0.004, 0.012, 0.004, 0.075, 0.004, 0, 0.5, -Math.PI / 2),
  );
}

/** 信封：封口朝上，盖着一枚红色火漆 */
export function letter() {
  return group(
    part(GEO.box, mat(0xf4ecdb), 0, 0.003, 0, 0.17, 0.006, 0.115),
    part(GEO.box, mat(0xe6dcc6), 0, 0.0062, -0.02, 0.1, 0.0005, 0.1, 0, Math.PI / 4, 0),
    part(GEO.cyl, mat(0xa8433a), 0, 0.006, 0.012, 0.014, 0.003, 0.014),
  );
}

// ---------- 柜子远景里每格的小摆件 ----------

/** 各类摆件在格子里的位置：相对格子底板中心的 [x, z] 偏移 */
export const CELL_SPOT: Record<OfferKind, [number, number]> = {
  candle: [-0.27, 0.1],
  flower: [0.27, 0.1],
  toy: [-0.31, -0.05],
  snack: [0.31, -0.05],
  letter: [0.26, 0.17],
};

/** 访客新放入礼物时，补到柜子格子里的小摆件（搭建时已有的那些走 Kit 实例化） */
export function cellMini(kind: OfferKind, i = 0) {
  switch (kind) {
    case 'flower':
      return flowerStem(i, 0.13);
    case 'candle':
      return group(
        part(GEO.cyl, mat(0xf6ecd8), 0, 0, 0, 0.018, 0.07, 0.018),
        part(GEO.smooth, flameMat, 0, 0.092, 0, 0.0105, 0.021, 0.0105),
      );
    case 'snack':
      return part(GEO.cyl, mat(0xb9bcc2), 0, 0, 0, 0.028, 0.035, 0.028);
    case 'toy':
      return part(GEO.ball, mat(TOY_COLORS[i % TOY_COLORS.length]), 0, 0.035, 0, 0.035, 0.035, 0.035);
    default:
      return part(GEO.box, mat(0xf4ecdb), 0, 0.003, 0, 0.085, 0.005, 0.055, 0, 0.3, 0);
  }
}

export const MINI_TOY_COLORS = TOY_COLORS;
