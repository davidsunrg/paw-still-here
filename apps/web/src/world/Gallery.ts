import * as THREE from 'three';
import { CONFIG, ZONES } from '../config';
import { SECTION_CELLS, SECTIONS, type Pet, type Section } from '../data/pets';
import { store } from '../data/store';
import { STR } from '../i18n';
import { LabelBatch, PhotoBatch } from './Batches';
import { TRACE } from './gifts';
import { plankTexture, textMesh } from './textures';
import type { SlotInfo, World } from './World';

const G = CONFIG.gallery;

/** 照片墙上的一格 */
export interface Cell {
  section: Section;
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
 * 两个区每一格的位置，按地址顺序排列。
 * 格号按列编：面向墙从左到右，每列从上到下；所以绕着大厅顺时针走，格号是连着的。
 */
function layout(): { cells: Cell[]; slabs: Slab[] } {
  const hw = CONFIG.hall.w / 2;
  const T = CONFIG.wallT;
  const zc = -CONFIG.hall.d / 2;
  const side = (G.sideCols - 1) / 2;
  const cells: Cell[] = [];
  const column = (section: Section, c: number, x: number, z: number, rotY: number) => {
    G.rowY.forEach((y, r) => cells.push({ section, cell: c * G.rows + r + 1, at: new THREE.Vector3(x, y, z), rotY }));
  };
  // A 区：进门左手，从大门一端排向后墙
  for (let c = 0; c < G.sideCols; c++) column('A', c, -hw + T / 2, zc + (side - c) * G.pitch, Math.PI / 2);
  // B 区：正对大门，石门左右各一段，格号跨过石门连着编
  const backZ = ZONES.hallBack + T / 2;
  const outer = G.backInner + (G.backCols - 1) * G.pitch;
  for (let c = 0; c < G.backCols; c++) column('B', c, -outer + c * G.pitch, backZ, 0);
  for (let c = 0; c < G.backCols; c++) column('B', G.backCols + c, G.backInner + c * G.pitch, backZ, 0);

  // C–H：后门展区的三排双面墙，每面 12 列 × 3 行
  const W = G.wing;
  W.wallZ.forEach((wallZ, wall) => {
    for (const side of [1, -1] as const) {
      const section = SECTIONS[2 + wall * 2 + (side > 0 ? 0 : 1)] as Section;
      for (let c = 0; c < W.cols; c++) {
        const x = side * (c - (W.cols - 1) / 2) * G.pitch;
        const z = wallZ + side * (W.thickness / 2 + G.slabT);
        G.rowY.forEach((y, r) => cells.push({ section, cell: c * G.rows + r + 1, at: new THREE.Vector3(x, y, z), rotY: side > 0 ? 0 : Math.PI }));
      }
    }
  });

  const sideLen = G.sideCols * G.pitch + 0.5;
  const backLen = G.backCols * G.pitch + 0.5;
  const backMid = (G.backInner + outer) / 2;
  const slabs: Slab[] = [
    { x: -hw + T / 2, z: zc, len: sideLen, rotY: Math.PI / 2 },
    { x: -backMid, z: backZ, len: backLen, rotY: 0 },
    { x: backMid, z: backZ, len: backLen, rotY: 0 },
  ];
  return { cells, slabs };
}

/**
 * 后门展区：一段走廊、地板、外围墙和三排双面展墙。
 * 展墙上的相框由 buildGallery 统一按 Cell 摆放。
 */
function buildWing(w: World) {
  const { kit, scene } = w;
  const C = CONFIG.colors;
  const H = CONFIG.wallH;
  const T = CONFIG.wallT;
  const hw = CONFIG.hall.w / 2;
  const W = G.wing;
  const hallBack = ZONES.hallBack;
  const depth = hallBack - W.backZ;
  const midZ = (hallBack + W.backZ) / 2;

  // 地板：和大厅同一种木板，后门直接接上
  const planks = plankTexture();
  planks.repeat.set(CONFIG.hall.w / 2.4, depth / 2.4);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(CONFIG.hall.w, depth).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ map: planks, roughness: 0.55, color: 0xb08a6c }),
  );
  floor.position.set(0, 0.04, midZ);
  floor.receiveShadow = true;
  scene.add(floor);

  // 外围墙：两侧和尽头
  for (const s of [-1, 1]) {
    kit.box(s * hw, H / 2, midZ, T, H, depth, C.stone);
    w.collide(s * hw, midZ, T, depth, true);
  }
  kit.box(0, H / 2, W.backZ, CONFIG.hall.w + T, H, T, C.stone);
  w.collide(0, W.backZ, CONFIG.hall.w, T, true);

  // 后门到展区之间的走廊
  const corridorDepth = hallBack - W.corridorEnd;
  for (const s of [-1, 1]) {
    kit.box(s * W.corridorHalf, H / 2, hallBack - corridorDepth / 2, 0.3, H, corridorDepth, C.stone);
    w.collide(s * W.corridorHalf, hallBack - corridorDepth / 2, 0.3, corridorDepth, true);
  }
  const sign = textMesh(STR.wingTitle, { height: 0.34, color: '#ffd9a0', glow: 1.6, maxWidth: 5.4 });
  sign.position.set(0, 3.55, W.corridorEnd + 0.1);
  scene.add(sign);
  w.pointLight(0, 3.6, W.corridorEnd + 1, 8, 12);

  // 三排双面展墙
  for (const z of W.wallZ) {
    kit.box(0, W.height / 2, z, W.length, W.height, W.thickness, 0x6f6b65);
    kit.box(0, W.height + 0.04, z, W.length + 0.24, 0.08, W.thickness + 0.14, 0x5a4636);
    kit.box(0, 0.07, z, W.length, 0.14, W.thickness + 0.1, 0x5a4636);
    w.collide(0, z, W.length + 0.2, W.thickness + 0.2, true);
    for (const side of [-1, 1]) {
      kit.box(0, (G.slabY[0] + G.slabY[1]) / 2, z + side * (W.thickness / 2 + G.slabT / 2), W.length, G.slabY[1] - G.slabY[0], G.slabT, 0x7f7a73);
      kit.glowBox(0, W.height - 0.06, z + side * (W.thickness / 2 + G.slabT + 0.035), W.length - 0.5, 0.025, 0.025, C.warm, 1);
    }
  }
  // 灯放在走道上方，别放进墙里
  const aisles = [
    (W.corridorEnd + W.wallZ[0]!) / 2,
    (W.wallZ[0]! + W.wallZ[1]!) / 2,
    (W.wallZ[1]! + W.wallZ[2]!) / 2,
    (W.wallZ[2]! + W.backZ) / 2,
  ];
  aisles.forEach((z, i) => w.pointLight(0, 4.4, z, i === 0 ? 9 : 7, 11));
}

/**
 * 大厅两面墙上的照片墙：石板上一格一格的相框，每格下面一条小石台和一块带格号的名牌。
 * 住了宠物的格子有照片、有灯；空格子是一块素面石板，只有格号。
 * 返回的 refresh 在有人为某只宠物放下礼物之后调用，更新它石台上的痕迹。
 */
/** 共享墙面上的一格：相框、石台、灯和铭牌底板只建一次 */
interface ShellCell {
  section: Section;
  cell: number;
  rotY: number;
  /** 照片中心 */
  photoAt: THREE.Vector3;
  /** 铭牌文字中心 */
  labelAt: THREE.Vector3;
  labelW: number;
  labelH: number;
  /** 石台台面，用来放花和蜡烛 */
  ledge: THREE.Vector3;
  frame: number;
}

export interface FloorContent {
  photos: PhotoBatch;
  labels: LabelBatch;
  slots: Map<string, SlotInfo>;
}

export interface Gallery {
  /** 换一层内容：只换照片、铭牌、痕迹和 slots，墙上的框架不动 */
  showFloor(floor: number, pets: Pet[]): FloorContent;
  /** 这只宠物收到了新的礼物：更新它石台上的痕迹 */
  refresh(pet: Pet): void;
  /** 某一格换成了另一只宠物：把痕迹移到同一格 */
  refreshSlot(localSlot: number, pet: Pet): void;
}

/**
 * 大厅两面墙和后展区共用的照片墙框架：石板、相框、石台、灯、区名牌只建一次。
 * 每一层的照片、铭牌、痕迹由 showFloor 换上。
 */
export function buildGallery(w: World): Gallery {
  const { kit } = w;
  const C = CONFIG.colors;
  const { cells, slabs } = layout();
  buildWing(w);
  if (import.meta.env.DEV) {
    SECTIONS.forEach((id, i) => {
      const built = cells.filter((c) => c.section === id).length;
      if (built !== SECTION_CELLS[i]) console.warn(`[gallery] section ${id} should have ${SECTION_CELLS[i]} cells, built ${built}`);
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

  const frameColors = [0x3b2a20, 0xd9c7a0, 0xf2efe8, 0xb08d57, 0x5a4636];
  const F = G.frame;
  const shellCells: ShellCell[] = [];
  cells.forEach((cell, i) => {
    const { at, rotY } = cell;
    const nx = Math.sin(rotY);
    const nz = Math.cos(rotY);
    /** 离墙面 d 米、比相框中心高 dy 米的位置 */
    const p = (d: number, dy = 0) => new THREE.Vector3(at.x + nx * d, at.y + dy, at.z + nz * d);
    const box = (v: THREE.Vector3, sx: number, sy: number, sz: number, color: number) => kit.box(v.x, v.y, v.z, sx, sy, sz, color, rotY);
    const T = G.slabT;

    const frame = frameColors[i % frameColors.length]!;
    const ledge = p(T + 0.06, -F / 2 - 0.065);
    box(ledge, F + 0.1, 0.03, 0.12, 0xb3ada2);
    box(p(T + 0.008, -F / 2 - 0.137), F - 0.06, 0.115, 0.014, 0x6b4a2a);
    box(p(T + 0.02), F + 0.06, F + 0.06, 0.04, frame);
    const lamp = p(T + 0.07, F / 2 + 0.045);
    kit.glowBox(lamp.x, lamp.y, lamp.z, F * 0.6, 0.016, 0.03, C.warm, 2.3, rotY);
    // 没有照片的格子露出的深色内衬
    box(p(T + 0.0405), F - 0.012, F - 0.012, 0.004, 0x17151a);

    shellCells.push({
      section: cell.section,
      cell: cell.cell,
      rotY,
      photoAt: p(T + 0.045),
      labelAt: p(T + 0.017, -F / 2 - 0.137),
      labelW: F - 0.08,
      labelH: 0.105,
      ledge: ledge.clone().setY(ledge.y + 0.015),
      frame,
    });
  });

  // 每个区两端的铭牌：区名和这个区的格号范围
  SECTIONS.forEach((id, i) => {
    const count = SECTION_CELLS[i];
    const mine = cells.filter((c) => c.section === id);
    const ends = [mine[0], mine[mine.length - 1]];
    ends.forEach((cell, k) => {
      if (!cell) return;
      const { rotY } = cell;
      const along = (k === 0 ? 1 : -1) * G.pitch * 0.9;
      const x = cell.at.x + Math.cos(rotY) * along;
      const z = cell.at.z - Math.sin(rotY) * along;
      const nx = Math.sin(rotY);
      const nz = Math.cos(rotY);
      const text = textMesh(STR.sectionPlaque(id, count), { height: 0.26, color: '#ffd9a0', glow: 1.3, maxWidth: 2.2 });
      kit.box(x + nx * 0.02, G.plaqueY, z + nz * 0.02, text.userData.width + 0.1, 0.34, 0.04, 0x5a4636, rotY);
      text.position.set(x + nx * 0.045, G.plaqueY, z + nz * 0.045);
      text.rotation.y = rotY;
      w.scene.add(text);
    });
  });

  let active: { photos: PhotoBatch; labels: LabelBatch; slots: Map<string, SlotInfo>; traces: Traces } | null = null;

  const disposeActive = () => {
    if (!active) return;
    active.photos.dispose();
    active.labels.dispose();
    active.traces.dispose();
    active = null;
  };

  return {
    showFloor(_floor: number, pets: Pet[]): FloorContent {
      disposeActive();
      const photos = new PhotoBatch(pets);
      const labels = new LabelBatch();
      const slots = new Map<string, SlotInfo>();
      shellCells.forEach((shell, i) => {
        const pet = pets[i];
        if (!pet) {
          // 空楼层：深色内衬 + 只有格号的空名牌
          labels.add('', shell.labelAt, shell.rotY, shell.labelW, shell.labelH, String(shell.cell), true);
          return;
        }
        const entry = photos.add(pet, shell.photoAt, shell.rotY, F, F);
        const years = pet.passedDate ? ` · ${pet.passedDate.slice(0, 4)}` : '';
        labels.add(`${pet.name}${years}`, shell.labelAt, shell.rotY, shell.labelW, shell.labelH, String(shell.cell));
        slots.set(pet.id, { entry, ledge: shell.ledge, frame: shell.frame });
      });
      photos.build(w.scene);
      labels.build(w.scene);
      const traces = buildTraces(w, pets, slots);
      active = { photos, labels, slots, traces };
      return { photos, labels, slots };
    },
    refresh(pet: Pet) {
      active?.traces.refresh(pet);
    },
    refreshSlot(localSlot: number, pet: Pet) {
      active?.traces.refreshSlot(localSlot, pet);
    },
  };
}

interface Traces {
  refresh(pet: Pet): void;
  refreshSlot(localSlot: number, pet: Pet): void;
  dispose(): void;
}

/**
 * 石台上的痕迹：有人放过花，就横着一枝花；点过蜡烛，就立着一点烛光。
 * 每只宠物在四个实例化网格里各占一个位置，没有的时候缩成零。
 */
function buildTraces(w: World, pets: Array<Pet | undefined>, slots: Map<string, SlotInfo>): Traces {
  const ids = pets.map((pet) => pet?.id ?? '');
  const meshes: THREE.InstancedMesh[] = [];
  const make = (part: { geo: THREE.BufferGeometry; mat: THREE.Material }) => {
    const mesh = new THREE.InstancedMesh(part.geo, part.mat, Math.max(1, ids.length));
    mesh.frustumCulled = false;
    w.scene.add(mesh);
    meshes.push(mesh);
    return mesh;
  };
  const stems = make(TRACE.stem);
  const blooms = make(TRACE.bloom);
  const waxes = make(TRACE.wax);
  const flames = make(TRACE.flame);

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const upright = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);
  const color = new THREE.Color();
  const set = (mesh: THREE.InstancedMesh, i: number, show: boolean, rot: THREE.Quaternion, sx: number, sy: number, sz: number) => {
    if (show) scale.set(sx, sy, sz);
    else scale.setScalar(0);
    mesh.setMatrixAt(i, m.compose(pos, rot, scale));
    mesh.instanceMatrix.needsUpdate = true;
  };

  const refresh = (pet: Pet) => {
    const i = ids.indexOf(pet.id);
    const slot = slots.get(pet.id);
    if (i < 0 || !slot) return;
    const { ledge, entry } = slot;
    const flowers = store.gifts(pet).flower;
    const hasFlower = flowers.length > 0;
    const hasCandle = store.counts(pet).candle > 0;
    tangent.set(Math.cos(entry.rotY), 0, -Math.sin(entry.rotY));

    q.setFromUnitVectors(UP, tangent);
    pos.copy(ledge).addScaledVector(tangent, 0.05).setY(ledge.y + 0.006);
    set(stems, i, hasFlower, q, 0.004, 0.15, 0.004);
    pos.copy(ledge).addScaledVector(tangent, 0.21).setY(ledge.y + 0.02);
    set(blooms, i, hasFlower, upright, 0.032, 0.024, 0.032);
    blooms.setColorAt(i, color.set(TRACE.bloomColors[(flowers[flowers.length - 1] ?? 0) % TRACE.bloomColors.length]));
    if (blooms.instanceColor) blooms.instanceColor.needsUpdate = true;

    pos.copy(ledge).addScaledVector(tangent, -0.2);
    set(waxes, i, hasCandle, upright, 0.015, 0.05, 0.015);
    pos.y += 0.072;
    set(flames, i, hasCandle, upright, 0.009, 0.019, 0.009);
  };
  const refreshSlot = (localSlot: number, pet: Pet) => {
    ids[localSlot] = pet.id;
    refresh(pet);
  };
  for (const pet of pets) if (pet) refresh(pet);
  return {
    refresh,
    refreshSlot,
    dispose() {
      for (const mesh of meshes) {
        mesh.removeFromParent();
        mesh.dispose();
      }
      meshes.length = 0;
    },
  };
}
