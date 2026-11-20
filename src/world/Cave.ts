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
  water: 0x0a1c2e,
  glow: 0x5fb4e6,
};

/** 大厅右墙朝里的墙面，和洞口后面那段岩洞从哪里开始 */
const HALL_FACE = CONFIG.hall.w / 2 - T / 2;
const GROTTO_X0 = CONFIG.hall.w / 2 + T / 2;

/**
 * 思念之河在大厅右墙上的入口：石砌的拱形洞口，上方挂一块木牌，洞里是一小段岩洞，
 * 石台外面是水，停着一条小木船。门洞本身由 Hall 在砌墙时留出来。
 * 游船还没有做：现在走到石台边就到头了，点洞口只有一行提示。
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

  // ---------- 洞口后面的一小段岩洞 ----------
  const depth = D.depth;
  const mid = GROTTO_X0 + depth / 2;
  const h = apex + 0.3;
  const half = D.half + 0.25;
  for (const s of [-1, 1]) {
    kit.box(mid, h / 2, z + s * (half + 0.15), depth, h, 0.3, COL.rock);
    w.collide(mid, z + s * (half + 0.15), depth, 0.3, true);
    // 岩壁上凸出来的石头
    kit.ball(GROTTO_X0 + 0.7, 0.5, z + s * (half - 0.05), 0.5, COL.rockDark, 1.3, s);
    kit.ball(GROTTO_X0 + 1.7, 1.6, z + s * (half + 0.02), 0.6, COL.rock, 1.1, s * 2);
    kit.ball(GROTTO_X0 + 1.2, 2.7, z + s * (half - 0.2), 0.55, COL.rockDark, 0.8, s * 3);
  }
  const endX = GROTTO_X0 + depth + 0.15;
  kit.box(endX, h / 2, z, 0.3, h, half * 2 + 0.6, COL.rockDark);
  w.collide(endX, z, 0.3, half * 2 + 0.6, true);
  kit.box(mid + 0.15, h + 0.15, z, depth + 0.3, 0.3, half * 2 + 0.6, COL.rockDark);

  // 石台：从大厅的地板接出来一小段，外面是水
  const landing = 0.95;
  const waterX0 = GROTTO_X0 + landing;
  kit.box((HALL_FACE + waterX0) / 2, 0.04, z, waterX0 - HALL_FACE, 0.08, D.half * 2, COL.landing);
  kit.box((GROTTO_X0 + waterX0) / 2, 0.035, z, landing, 0.08, half * 2, COL.landing);
  // 水面要比室外的草地高一点，不然会被草地盖住
  kit.box((waterX0 + endX) / 2, -0.01, z, endX - waterX0, 0.06, half * 2, COL.water);
  kit.pool((waterX0 + endX) / 2 + 0.1, z, 2.2, COL.glow, 0.22, 0.03);
  // 水面挡着，走到石台边就到头了
  w.collide((waterX0 + endX) / 2, z, endX - waterX0, half * 2);

  // 停着的小木船：船头朝里，船头一盏灯
  const bx = waterX0 + 0.72;
  const by = 0.1;
  kit.box(bx, by - 0.02, z, 1.25, 0.2, 0.74, C.wood);
  kit.box(bx, by + 0.07, z, 1.05, 0.06, 0.54, C.woodDark);
  for (const s of [-1, 1]) kit.box(bx, by + 0.13, z + s * 0.36, 1.3, 0.12, 0.06, C.woodLight);
  kit.box(bx + 0.67, by + 0.1, z, 0.1, 0.34, 0.5, C.woodLight);
  kit.box(bx - 0.2, by + 0.14, z, 0.14, 0.05, 0.62, C.woodLight);
  kit.cyl(bx + 0.55, by + 0.1, z, 0.018, 0.5, C.woodDark);
  kit.glowBox(bx + 0.55, by + 0.66, z, 0.12, 0.16, 0.12, C.warm, 2.6);

  // 洞里一点蓝色的水光
  w.pointLight(waterX0 + 0.3, 1.3, z, 7, 7, COL.glow);

  w.proxy(CONFIG.hall.w / 2, apex / 2, z, T + 0.2, apex, D.half * 2, STR.tipCave, () => w.hooks.cave());
}
