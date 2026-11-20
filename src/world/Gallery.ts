import * as THREE from 'three';
import { CONFIG, ZONES } from '../config';
import { PETS, WALL_CELLS, type Pet } from '../data/pets';
import type { World } from './World';

const G = CONFIG.gallery;

/** 照片墙上的一格 */
export interface Cell {
  wall: number;
  cell: number;
  /** 相框中心在墙面上的位置（贴着墙面），以及墙面朝向 */
  at: THREE.Vector3;
  rotY: number;
}

/** 一面墙上连续的一段石板：中心、沿墙的长度、朝向 */
interface Slab {
  x: number;
  z: number;
  len: number;
  rotY: number;
}

/**
 * 三面墙上每一格的位置，按地址顺序排列。
 * 格号按列编：面向墙从左到右，每列从上到下；所以绕着大厅顺时针走，格号是连着的。
 */
function layout(): { cells: Cell[]; slabs: Slab[] } {
  const hw = CONFIG.hall.w / 2;
  const T = CONFIG.wallT;
  const zc = -CONFIG.hall.d / 2;
  const side = (G.sideCols - 1) / 2;
  const cells: Cell[] = [];
  const column = (wall: number, c: number, x: number, z: number, rotY: number) => {
    G.rowY.forEach((y, r) => cells.push({ wall, cell: c * G.rows + r + 1, at: new THREE.Vector3(x, y, z), rotY }));
  };
  // 1 号墙：进门左手，从大门一端排向后墙
  for (let c = 0; c < G.sideCols; c++) column(1, c, -hw + T / 2, zc + (side - c) * G.pitch, Math.PI / 2);
  // 2 号墙：正对大门，石门左右各一段，格号跨过石门连着编
  const backZ = ZONES.hallBack + T / 2;
  const outer = G.backInner + (G.backCols - 1) * G.pitch;
  for (let c = 0; c < G.backCols; c++) column(2, c, -outer + c * G.pitch, backZ, 0);
  for (let c = 0; c < G.backCols; c++) column(2, G.backCols + c, G.backInner + c * G.pitch, backZ, 0);
  // 3 号墙：进门右手，从后墙一端排回大门
  for (let c = 0; c < G.sideCols; c++) column(3, c, hw - T / 2, zc - (side - c) * G.pitch, -Math.PI / 2);

  const sideLen = G.sideCols * G.pitch + 0.5;
  const backLen = G.backCols * G.pitch + 0.5;
  const backMid = (G.backInner + outer) / 2;
  const slabs: Slab[] = [
    { x: -hw + T / 2, z: zc, len: sideLen, rotY: Math.PI / 2 },
    { x: -backMid, z: backZ, len: backLen, rotY: 0 },
    { x: backMid, z: backZ, len: backLen, rotY: 0 },
    { x: hw - T / 2, z: zc, len: sideLen, rotY: -Math.PI / 2 },
  ];
  return { cells, slabs };
}

/**
 * 大厅三面墙上的照片墙：石板上一格一格的相框，每格下面一条小石台和一块带格号的名牌。
 * 住了宠物的格子有照片、有灯；空格子是一块素面石板，只有格号。
 */
export function buildGallery(w: World) {
  const { kit } = w;
  const C = CONFIG.colors;
  const { cells, slabs } = layout();
  if (import.meta.env.DEV) {
    WALL_CELLS.forEach((n, i) => {
      const built = cells.filter((c) => c.wall === i + 1).length;
      if (built !== n) console.warn(`[gallery] ${i + 1} 号墙应有 ${n} 格，实际搭了 ${built} 格`);
    });
  }

  // 墙面上的石板、墙脚和顶上的一线暖光
  const [y0, y1] = G.slabY;
  for (const s of slabs) {
    const nx = Math.sin(s.rotY);
    const nz = Math.cos(s.rotY);
    const at = (d: number): [number, number] => [s.x + nx * d, s.z + nz * d];
    const [sx, sz] = at(G.slabT / 2);
    kit.box(sx, (y0 + y1) / 2, sz, s.len, y1 - y0, G.slabT, 0x9c978e, s.rotY);
    const [bx, bz] = at(0.09);
    kit.box(bx, y0 / 2, bz, s.len + 0.1, y0, 0.18, C.stone, s.rotY);
    kit.box(bx, y1 + 0.04, bz, s.len + 0.1, 0.08, 0.18, C.stone, s.rotY);
    const [gx, gz] = at(0.2);
    kit.glowBox(gx, y1 + 0.02, gz, s.len - 0.3, 0.025, 0.025, C.warm, 1.5, s.rotY);
  }

  const occupants = new Map<string, Pet>(PETS.map((p) => [`${p.wall}-${p.cell}`, p]));
  const frameColors = [0x3b2a20, 0xd9c7a0, 0xf2efe8, 0xb08d57, 0x5a4636];
  const F = G.frame;
  cells.forEach((cell, i) => {
    const { at, rotY } = cell;
    const nx = Math.sin(rotY);
    const nz = Math.cos(rotY);
    /** 离墙面 d 米、比相框中心高 dy 米的位置 */
    const p = (d: number, dy = 0) => new THREE.Vector3(at.x + nx * d, at.y + dy, at.z + nz * d);
    const box = (v: THREE.Vector3, sx: number, sy: number, sz: number, color: number) => kit.box(v.x, v.y, v.z, sx, sy, sz, color, rotY);
    const pet = occupants.get(`${cell.wall}-${cell.cell}`);
    const T = G.slabT;

    // 相框下的小石台，和石台下面的名牌
    const ledge = p(T + 0.06, -F / 2 - 0.065);
    box(ledge, F + 0.1, 0.03, 0.12, 0xb3ada2);
    const plate = p(T + 0.008, -F / 2 - 0.137);
    box(plate, F - 0.06, 0.115, 0.014, pet ? 0x6b4a2a : 0x6f6b65);
    const label = p(T + 0.017, -F / 2 - 0.137);

    if (!pet) {
      // 空格子：一块略深的素面石板，等着以后住进来
      box(p(T + 0.004), F, F, 0.01, 0x8a857d);
      w.labels.add('', label, rotY, F - 0.08, 0.105, String(cell.cell), true);
      return;
    }
    box(p(T + 0.02), F + 0.06, F + 0.06, 0.04, frameColors[i % frameColors.length]);
    const entry = w.photos.add(pet, p(T + 0.045), rotY, F, F);
    const lamp = p(T + 0.07, F / 2 + 0.045);
    kit.glowBox(lamp.x, lamp.y, lamp.z, F * 0.6, 0.016, 0.03, C.warm, 2.3, rotY);
    w.labels.add(`${pet.name} · ${pet.passedDate.slice(0, 4)}`, label, rotY, F - 0.08, 0.105, String(cell.cell));
    w.slots.set(pet.id, { entry, ledge: ledge.clone().setY(ledge.y + 0.015) });
  });
}
