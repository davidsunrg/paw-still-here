import * as THREE from 'three';
import { CONFIG } from '../config';
import { mulberry32 } from '../data/pets';
import { STR } from '../i18n';
import { LANTERN_X, pathX } from './Outdoor';
import type { World } from './World';

const LT = CONFIG.lanternTerrace;
const LX = LANTERN_X;
const LZ = LT.z;

/** 矮木桌：摆在石台上背向步道的一侧，长边顺着步道 */
const TABLE = { x: LX + 0.55, z: LZ, w: 0.72, len: 1.5, top: 0.52 };
/** 挂着亮灯的木架，立在桌子后面 */
const RACK = { x: LX + 1.55, half: 1.05, h: 2.7 };

/**
 * 小人站在桌前放孔明灯的位置：面向桌子（背对步道）；
 * 镜头在它的斜后方、略微仰起，放出的灯会从画面中间升上夜空。
 */
export const LANTERN_SPOT = { x: TABLE.x - 1.15, z: LZ, facing: -Math.PI / 2, yaw: -Math.PI / 2 + 0.3, pitch: 0.04 };

/** 孔明灯从桌面上方的这个位置升起：略靠桌前，升起来时不会碰到后面的木架 */
export const LANTERN_LAUNCH = new THREE.Vector3(TABLE.x - 0.2, TABLE.top + 1.0, TABLE.z);

/** 模拟访客在石台上站着看的两个位置（在桌子两头，不占桌前正中） */
export const LANTERN_STANDS: Array<{ x: number; z: number; facing: number }> = [
  { x: LX - 0.5, z: LZ + 1.25, facing: -Math.PI / 2 - 0.5 },
  { x: LX - 0.5, z: LZ - 1.25, facing: -Math.PI / 2 + 0.5 },
];

/** 搭建孔明灯平台：圆形石台、矮木桌和桌上没点的纸灯、挂着亮灯的木架 */
export function buildLanternTerrace(w: World) {
  const { kit, scene } = w;
  const C = CONFIG.colors;
  const rnd = mulberry32(67);
  const R = (a: number, b: number) => a + rnd() * (b - a);
  const gray = (a: number, b: number) => {
    const g = Math.round(R(a, b));
    return (g << 16) | (g << 8) | (g - 8);
  };

  // ---------- 石台 ----------
  const slab = new THREE.Mesh(
    new THREE.CircleGeometry(LT.radius, 28).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x8f8b84, roughness: 1 }),
  );
  slab.position.set(LX, 0.015, LZ);
  slab.receiveShadow = true;
  scene.add(slab);
  // 边上压一圈扁石头
  for (let a = 0; a < Math.PI * 2; a += R(0.26, 0.4)) {
    const r = LT.radius + R(-0.06, 0.06);
    kit.cyl(LX + Math.cos(a) * r, 0, LZ + Math.sin(a) * r, R(0.17, 0.26), 0.06, gray(128, 160));
  }
  // 从步道通到石台的几块踏脚石
  const edge = pathX(LZ) + CONFIG.path.width / 2;
  for (let i = 0; i < 3; i++) {
    const x = THREE.MathUtils.lerp(edge + 0.1, LX - LT.radius - 0.15, (i + 0.5) / 3);
    kit.cyl(x, 0.01, LZ + R(-0.18, 0.18), R(0.26, 0.34), 0.05, gray(118, 150));
  }

  // ---------- 矮木桌 ----------
  const { x: tx, z: tz, top } = TABLE;
  kit.box(tx, top - 0.035, tz, TABLE.w, 0.07, TABLE.len, C.wood);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      kit.box(tx + sx * (TABLE.w / 2 - 0.07), (top - 0.07) / 2, tz + sz * (TABLE.len / 2 - 0.09), 0.07, top - 0.07, 0.07, C.woodDark);
    }
  }
  // 桌上几盏还没点的纸灯，和一支小蜡烛
  const paper = 0xb9ae98;
  for (const [dx, dz, s] of [[-0.08, -0.46, 1], [0.1, -0.1, 0.9], [-0.05, 0.42, 1.05]]) {
    kit.cyl(tx + dx, top, tz + dz, 0.115 * s, 0.26 * s, paper);
    kit.cyl(tx + dx, top, tz + dz, 0.125 * s, 0.025, C.woodLight);
  }
  kit.cyl(tx + 0.2, top, tz + 0.2, 0.022, 0.09, 0xfff4dd);
  kit.flame(tx + 0.2, top + 0.125, tz + 0.2, 0.032);
  w.collide(tx, tz, TABLE.w + 0.1, TABLE.len + 0.1);

  // ---------- 木架：两根柱子一根横梁，挂着三盏亮着的灯 ----------
  for (const s of [-1, 1]) {
    kit.cyl(RACK.x, 0, LZ + s * RACK.half, 0.055, RACK.h, C.woodDark);
    w.collide(RACK.x, LZ + s * RACK.half, 0.3, 0.3);
  }
  kit.box(RACK.x, RACK.h - 0.06, LZ, 0.08, 0.08, RACK.half * 2 + 0.3, C.woodDark);
  for (const [dz, drop] of [[-0.62, 0.42], [0, 0.6], [0.62, 0.36]]) {
    const y = RACK.h - 0.1 - drop;
    kit.box(RACK.x, y + drop / 2, LZ + dz, 0.012, drop, 0.012, C.woodDark);
    kit.glowCyl(RACK.x, y - 0.36, LZ + dz, 0.15, 0.36, 0xffb060, 2.1);
    kit.cyl(RACK.x, y - 0.02, LZ + dz, 0.16, 0.025, 0x3a2a20);
  }
  kit.pool(LX + 0.4, LZ, 7, 0xffa860, 0.3);
  w.pointLight(RACK.x - 0.5, 2.1, LZ, 24, 14, 0xffa860);

  w.proxy(tx, top + 0.25, tz, TABLE.w + 0.15, 0.7, TABLE.len + 0.1, STR.tipLantern, () => w.hooks.lantern());
}
