import * as THREE from 'three';
import { CONFIG } from '../config';
import { STR } from '../i18n';
import { textMesh } from './textures';
import type { World } from './World';

const D = CONFIG.cave.door;
const T = CONFIG.wallT;

/** 颜色：洞口的石头偏暖灰，洞里的岩壁很暗，水是深蓝色 */
const COL = {
  stone: 0x7d7a74,
  stoneDark: 0x6a6762,
  rock: 0x2a2d33,
  rockDark: 0x202328,
  landing: 0x4a4c50,
  glow: 0x5fb4e6,
};

/** 大厅右墙朝里的墙面，和洞口后面那段岩洞从哪里开始 */
const HALL_FACE = CONFIG.hall.w / 2 - T / 2;
const GROTTO_X0 = CONFIG.hall.w / 2 + T / 2;

/** 洞口后面那一小间岩洞的半宽；右拐的窄道从离大厅墙多远的地方开始 */
const HALF = D.half + 0.25;
const AISLE = 0.8;

/** 访客是不是已经右拐走进了窄道（该换到山洞里了） */
export function inCaveDoor(x: number, z: number) {
  return x > GROTTO_X0 + AISLE && x < GROTTO_X0 + D.depth && z > D.z + HALF + D.enter && z < D.z + HALF + D.turn;
}

/** 从山洞里回来（走回头路，或者中途下船）后站在哪里：大厅里的洞口前，面向洞口 */
export const CAVE_BACK = { x: HALL_FACE - 1.6, z: D.z, yaw: -Math.PI / 2 };

/**
 * 思念之河在大厅右墙上的入口：石砌的拱形洞口，上方挂一块木牌。洞里是一小间岩洞，迎面的石壁上
 * 一个发光的箭头指向右边，右手边是一条窄道，走进去就换到山洞里。门洞本身由 Hall 在砌墙时留出来。
 */
export function buildCaveEntrance(w: World) {
  const { kit } = w;
  const C = CONFIG.colors;
  const z = D.z;
  const apex = D.spring + D.half;

  // ---------- 洞口：一圈拱石、两侧垒起来的石块、脚下的几块大石头 ----------
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(D.half + 0.13, 0.18, 6, 11, Math.PI),
    new THREE.MeshStandardMaterial({ color: COL.stone, roughness: 1, flatShading: true }),
  );
  ring.position.set(HALL_FACE - 0.02, D.spring, z);
  ring.rotation.y = -Math.PI / 2;
  ring.castShadow = true;
  w.scene.add(ring);
  const courses = 4;
  for (const s of [-1, 1]) {
    for (let i = 0; i < courses; i++) {
      const h = D.spring / courses;
      const wide = i % 2 ? 0.34 : 0.42;
      kit.box(HALL_FACE - 0.06, h * (i + 0.5), z + s * (D.half + 0.13), 0.3 + (i % 2) * 0.06, h - 0.02, wide, i % 2 ? COL.stoneDark : COL.stone);
    }
    kit.ball(HALL_FACE - 0.42, 0.2, z + s * (D.half + 0.78), 0.44, 0x77767a, 0.7, s * 1.3);
    kit.ball(HALL_FACE - 0.3, 0.12, z + s * (D.half + 1.3), 0.26, 0x6c6b70, 0.65, s * 2.6);
    kit.ball(HALL_FACE - 0.75, 0.1, z + s * (D.half + 0.35), 0.2, 0x818086, 0.6, s * 0.4);
    w.collide(HALL_FACE - 0.35, z + s * (D.half + 0.85), 0.8, 1.1);
  }

  // ---------- 木牌：两行字，两头各挂一盏小灯 ----------
  const board = { y: apex + 0.72, h: 0.8, w: 3.4 };
  kit.box(HALL_FACE - 0.06, board.y, z, 0.1, board.h, board.w, 0x5a4636);
  for (const s of [-1, 1]) {
    kit.box(HALL_FACE - 0.06, board.y, z + s * (board.w / 2 - 0.06), 0.13, board.h + 0.08, 0.1, C.woodDark);
    kit.glowBox(HALL_FACE - 0.2, board.y - board.h / 2 - 0.16, z + s * (board.w / 2 - 0.1), 0.13, 0.18, 0.13, C.warm, 2.4);
  }
  const sign = textMesh(STR.caveSign, { height: 0.36, color: '#ffd9a0', glow: 1.7, maxWidth: board.w - 0.5 });
  const sub = textMesh(STR.caveSub, { height: 0.16, color: '#fff1dc', glow: 1.1, maxWidth: board.w - 0.5 });
  for (const [m, y] of [[sign, board.y + 0.13], [sub, board.y - 0.2]] as const) {
    m.position.set(HALL_FACE - 0.12, y, z);
    m.rotation.y = -Math.PI / 2;
    w.scene.add(m);
  }
  kit.pool(HALL_FACE - 1.2, z, 3.4, COL.glow, 0.14);

  // ---------- 洞口后面的一小间岩洞，和右手边的窄道 ----------
  const depth = D.depth;
  const mid = GROTTO_X0 + depth / 2;
  const h = apex + 0.3;
  const half = HALF;
  const endX = GROTTO_X0 + depth + 0.15;
  /** 窄道的尽头（z） */
  const turnZ = z + half + D.turn;
  const wall = (x: number, wz: number, sx: number, sz: number, color: number) => {
    kit.box(x, h / 2, wz, sx, h, sz, color);
    w.collide(x, wz, sx, sz, true);
  };
  // 左手边的石壁是完整的；右手边只留靠大厅的一截，后面让出窄道的口
  wall(mid, z - half - 0.15, depth, 0.3, COL.rock);
  wall(GROTTO_X0 + AISLE / 2, (z + half + turnZ) / 2 + 0.15, AISLE, D.turn + 0.3, COL.rock);
  // 迎面的石壁一直延伸到窄道的尽头；窄道尽头是黑的
  wall(endX, (z - half + turnZ) / 2, 0.3, turnZ - (z - half) + 0.6, COL.rockDark);
  wall((GROTTO_X0 + AISLE + endX) / 2, turnZ + 0.15, endX - GROTTO_X0 - AISLE, 0.3, 0x08090c);
  // 顶
  kit.box(mid + 0.15, h + 0.15, z, depth + 0.3, 0.3, half * 2 + 0.6, COL.rockDark);
  kit.box(mid + 0.15, h + 0.15, (z + half + turnZ) / 2 + 0.3, depth + 0.3, 0.3, D.turn, COL.rockDark);
  // 岩壁上凸出来的石头
  kit.ball(GROTTO_X0 + 0.7, 0.5, z - half + 0.05, 0.5, COL.rockDark, 1.3, -1);
  kit.ball(GROTTO_X0 + 1.7, 1.6, z - half - 0.02, 0.6, COL.rock, 1.1, -2);
  kit.ball(GROTTO_X0 + 1.2, 2.7, z - half + 0.2, 0.55, COL.rockDark, 0.8, -3);
  kit.ball(GROTTO_X0 + 0.3, 0.4, z + half - 0.05, 0.42, COL.rockDark, 1.2, 1);

  // 地面：从大厅的地板接进来，铺满岩洞和窄道
  kit.box((HALL_FACE + GROTTO_X0) / 2, 0.04, z, GROTTO_X0 - HALL_FACE, 0.08, D.half * 2, COL.landing);
  kit.box(mid, 0.035, z, depth, 0.08, half * 2, COL.landing);
  kit.box((GROTTO_X0 + AISLE + endX) / 2, 0.035, (z + half + turnZ) / 2, endX - GROTTO_X0 - AISLE, 0.08, D.turn, COL.landing);

  // 迎面石壁上的箭头：指向右手边的窄道，下面一行小字
  const shape = new THREE.Shape();
  for (const [i, [ax, ay]] of [[-0.5, 0.07], [0.12, 0.07], [0.12, 0.24], [0.5, 0], [0.12, -0.24], [0.12, -0.07], [-0.5, -0.07]].entries()) {
    if (i) shape.lineTo(ax, ay);
    else shape.moveTo(ax, ay);
  }
  const arrow = new THREE.Mesh(
    new THREE.ShapeGeometry(shape),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(C.warm).multiplyScalar(1.9) }),
  );
  const label = textMesh(STR.caveArrow, { height: 0.2, color: '#ffe2b8', glow: 1.3, maxWidth: 2 });
  for (const [m, y] of [[arrow, 1.85], [label, 1.38]] as const) {
    m.position.set(endX - 0.17, y, z);
    m.rotation.y = -Math.PI / 2;
    w.scene.add(m);
  }

  // 岩洞里一盏暖色的小灯，窄道里一点蓝色的水光
  w.pointLight(GROTTO_X0 + depth * 0.55, 2.3, z, 6, 6);
  w.pointLight(GROTTO_X0 + AISLE + 0.8, 1.2, turnZ - 0.5, 5, 5, COL.glow);

  w.proxy(CONFIG.hall.w / 2, apex / 2, z, T + 0.2, apex, D.half * 2, STR.tipCave, () => w.hooks.cave());
}
