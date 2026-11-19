import * as THREE from 'three';
import { CONFIG, ZONES } from '../config';
import { mulberry32, PETS, type Pet } from '../data/pets';
import { STR } from '../strings';
import { Instancer } from './Kit';
import { archWall, bench, plant, sconce, wallStrip } from './parts';
import { textMesh, tileTexture } from './textures';
import type { World } from './World';

/** 纪念树所在位置 */
export const TREE_POS = new THREE.Vector3(0, 0, (ZONES.memFront + ZONES.memBack) / 2);

export function buildMemorial(w: World) {
  const { kit, scene } = w;
  const C = CONFIG.colors;
  const H = CONFIG.wallH;
  const T = CONFIG.wallT;
  const hw = CONFIG.memorial.w / 2;
  const d = CONFIG.memorial.d;
  const z0 = ZONES.memFront;
  const z1 = ZONES.memBack;
  const zc = (z0 + z1) / 2;
  const rnd = mulberry32(23);
  const R = (a: number, b: number) => a + rnd() * (b - a);

  // ---------- 地面 ----------
  const tiles = tileTexture(178, 10);
  tiles.repeat.set(CONFIG.memorial.w / 3, d / 3);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(CONFIG.memorial.w, d).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ map: tiles, roughness: 0.65 }),
  );
  floor.position.set(0, 0.04, zc);
  floor.receiveShadow = true;
  scene.add(floor);

  // ---------- 墙 ----------
  archWall(w, z0, CONFIG.memorial.w + T, CONFIG.corridor.doorHalf, CONFIG.corridor.doorSpring);
  kit.box(0, H / 2, z1, CONFIG.memorial.w + T, H, T, C.wall);
  w.collide(0, z1, CONFIG.memorial.w + T, T, true);
  wallStrip(kit, 0, z0, CONFIG.memorial.w, 0);
  wallStrip(kit, 0, z1, CONFIG.memorial.w, 0);
  for (const sx of [-1, 1]) {
    kit.box(sx * hw, H / 2, zc, T, H, d + T, C.wall);
    w.collide(sx * hw, zc, T, d + T, true);
    wallStrip(kit, sx * hw, zc, 0, d + T);
    for (const z of [z0, z1]) {
      kit.box(sx * hw, (H + 0.3) / 2, z, 0.75, H + 0.3, 0.75, 0xc8bca9);
      kit.glowBall(sx * hw, H + 0.52, z, 0.2, C.warm, 2.4);
    }
    // 侧墙壁灯
    for (let z = z0 - 4; z > z1 + 2; z -= 6.4) sconce(w, sx * (hw - T / 2), 2.9, z, -sx, 0);
  }
  for (let x = -hw + 4; x < hw - 2; x += 6) {
    sconce(w, x, 2.9, z1 + T / 2, 0, 1);
    if (Math.abs(x) > 4) sconce(w, x, 2.9, z0 - T / 2, 0, -1);
  }
  plant(w, -3.2, z0 - 1.0, 1.2);
  plant(w, 3.2, z0 - 1.0, 1.2);

  // ---------- 纪念柜 ----------
  const cab = CONFIG.cabinet;
  const perCab = cab.rows * cab.cols;
  const byCabinet: Pet[][] = Array.from({ length: cab.count }, () => []);
  for (const p of PETS) byCabinet[p.cabinetIndex]?.push(p);

  const cabX = hw * 0.6;
  const rowsZ: number[] = [];
  const pairs = Math.ceil(cab.count / 2);
  for (let i = 0; i < pairs; i++) {
    // 前后各一半，中间给纪念树留出空地
    const front = i < pairs / 2;
    const k = front ? i : i - Math.ceil(pairs / 2);
    rowsZ.push(front ? z0 - 7 - k * 6.5 : zc - 6.5 - k * 6.5);
  }
  for (let i = 0; i < cab.count; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const cz = rowsZ[Math.floor(i / 2)];
    buildCabinet(w, i, side * cabX, cz, byCabinet[i], perCab, R);
    // 每个柜子正前方一盏灯，照亮相框
    w.pointLight(side * (cabX - 1.2), 3.6, cz + 3.2, 30, 13);
  }

  // ---------- 中央的纪念树 ----------
  const { x: tx, z: tz } = TREE_POS;
  kit.cyl(tx, 0, tz, 2.5, 0.42, 0xa9a39a);
  kit.cyl(tx, 0.42, tz, 2.62, 0.07, 0xc4beb4);
  kit.cyl(tx, 0.42, tz, 2.2, 0.1, 0x4a3a2e);
  w.collide(tx, tz, 4.7, 4.7);
  kit.cyl(tx, 0.4, tz, 0.42, 1.6, 0xe9e1d6);
  kit.cyl(tx, 2.0, tz, 0.32, 1.5, 0xe9e1d6);
  kit.cyl(tx, 3.5, tz, 0.22, 1.2, 0xe9e1d6);

  const canopy = new Instancer(
    new THREE.IcosahedronGeometry(1, 1),
    new THREE.MeshStandardMaterial({
      color: 0xffe6cf,
      emissive: 0xff9d6b,
      emissiveIntensity: 0.28,
      roughness: 0.9,
      flatShading: true,
    }),
  );
  const blobs: Array<[number, number, number, number]> = [
    [0, 5.6, 0, 2.0], [1.7, 4.8, 0.5, 1.5], [-1.6, 4.9, -0.6, 1.55], [0.4, 4.7, -1.7, 1.4],
    [-0.5, 4.6, 1.7, 1.45], [1.1, 6.4, -0.6, 1.2], [-1.0, 6.5, 0.7, 1.25],
  ];
  for (const [bx, by, bz, br] of blobs) {
    canopy.add(tx + bx, by, tz + bz, br, br * 0.88, br, 0xffffff, 1, R(0, 6));
    // 树冠上的小灯
    for (let k = 0; k < 26; k++) {
      const v = new THREE.Vector3(R(-1, 1), R(-1, 0.9), R(-1, 1)).normalize().multiplyScalar(br * 1.02);
      kit.glowBall(tx + bx + v.x, by + v.y * 0.88, tz + bz + v.z, R(0.03, 0.055), rnd() < 0.7 ? C.warm : 0xffe9f0, 3.4);
    }
  }
  canopy.build(scene);
  // 垂下来的灯串
  for (let k = 0; k < 18; k++) {
    const a = R(0, Math.PI * 2);
    const r = R(1.2, 2.9);
    const top = R(3.6, 4.2);
    const n = 4 + Math.floor(R(0, 5));
    for (let j = 0; j < n; j++) {
      kit.glowBall(tx + Math.cos(a) * r, top - j * 0.24, tz + Math.sin(a) * r, 0.032, j % 2 ? C.warm : 0xfff3dc, 3.2);
    }
  }
  kit.pool(tx, tz, 20, C.warm, 0.3);
  w.pointLight(tx + 3.1, 2.3, tz + 3.1, 26, 22, 0xffcf9a);
  w.pointLight(tx - 3.1, 2.3, tz - 3.1, 26, 22, 0xffcf9a);

  const treeLabel = textMesh(STR.treeLabel, { height: 0.22, color: '#ffd9a0', glow: 1.6 });
  treeLabel.position.set(tx, 0.24, tz + 2.53);
  scene.add(treeLabel);

  bench(w, tx, tz + 4.7, Math.PI);
  bench(w, tx, tz - 4.7, 0);
  bench(w, tx + 4.7, tz, -Math.PI / 2);
  bench(w, tx - 4.7, tz, Math.PI / 2);
}

function buildCabinet(
  w: World, index: number, cx: number, cz: number, pets: Pet[], perCab: number,
  R: (a: number, b: number) => number,
) {
  const { kit } = w;
  const C = CONFIG.colors;
  const { rows, cols, cellW, cellH, depth: D, base, board: b } = CONFIG.cabinet;
  const W = cols * cellW + (cols + 1) * b;
  const bodyH = rows * cellH + (rows + 1) * b;
  const top = base + bodyH;
  const letter = String.fromCharCode(65 + index);

  kit.box(cx, base / 2, cz, W + 0.06, base, D + 0.04, C.woodDark);
  kit.box(cx, base + bodyH / 2, cz - D / 2 + 0.02, W, bodyH, 0.04, 0x3d2a1e);
  for (let i = 0; i <= rows; i++) kit.box(cx, base + i * (cellH + b) + b / 2, cz, W, b, D, C.wood);
  for (let j = 0; j <= cols; j++) kit.box(cx - W / 2 + b / 2 + j * (cellW + b), base + bodyH / 2, cz, b, bodyH, D, C.wood);
  kit.box(cx, top + 0.05, cz, W + 0.14, 0.1, D + 0.1, C.woodDark);
  w.collide(cx, cz, W + 0.1, D + 0.1, true);

  // 柜顶和侧面的编号
  const sign = textMesh(`${letter} ${STR.cabinetZone}`, { height: 0.34, color: '#ffd9a0', glow: 2.0 });
  sign.position.set(cx, top + 0.36, cz + D / 2);
  w.scene.add(sign);
  for (const sx of [-1, 1]) {
    const side = textMesh(letter, { height: 0.42, color: '#ffd9a0', glow: 1.7 });
    side.position.set(cx + sx * (W / 2 + 0.035), 1.75, cz);
    side.rotation.y = (sx * Math.PI) / 2;
    w.scene.add(side);
  }

  const bySlot = new Map(pets.map((p) => [p.slot, p]));
  const frameColors = [0x2f2119, 0xd9c7a0, 0xf2efe8, 0xb08d57];
  const flowerColors = [0xffb7c5, 0xfff2a8, 0xffffff, 0xc9b6ff, 0xff9db0];
  const toyColors = [0xff7a6b, 0x6bb8ff, 0xffd15c, 0x8fe08a];

  for (let s = 0; s < perCab; s++) {
    const r = Math.floor(s / cols);
    const c = s % cols;
    const x = cx - W / 2 + b + cellW / 2 + c * (cellW + b);
    const y0 = base + b + (rows - 1 - r) * (cellH + b);
    const pet = bySlot.get(s);

    // 每格顶部的小灯；空格子灯光更暗，表示「等待入驻」
    kit.glowBox(x, y0 + cellH - 0.012, cz + D / 2 - 0.07, cellW * 0.62, 0.014, 0.03, C.warm, pet ? 2.3 : 0.45);
    if (!pet) continue;

    const fy = y0 + 0.33;
    kit.box(x, fy, cz - 0.04, 0.45, 0.45, 0.03, frameColors[(s + index) % frameColors.length]);
    const frame = new THREE.Vector3(x, fy, cz - 0.02);
    w.photos.add(pet, frame, 0, 0.38, 0.38, 1.05);
    w.labels.add(`${pet.name} · ${pet.passedDate.slice(0, 4)}`, new THREE.Vector3(x, y0 + 0.048, cz + D / 2 - 0.09), 0, 0.34, 0.085);
    kit.box(x, y0 + 0.048, cz + D / 2 - 0.1, 0.36, 0.095, 0.015, 0x6b4a2a);

    const stats = w.statsOf(pet);
    const slot = {
      floor: new THREE.Vector3(x, y0, cz),
      frame,
      cabinetX: cx,
      cabinetZ: cz,
      hasFlower: stats.flowers > 0,
      hasCandle: stats.candles > 0,
    };
    w.slots.set(pet.id, slot);

    if (slot.hasCandle) {
      kit.cyl(x - 0.27, y0, cz + 0.1, 0.018, 0.07, 0xf6ecd8);
      kit.flame(x - 0.27, y0 + 0.092, cz + 0.1, 0.014);
    }
    if (slot.hasFlower) {
      kit.cyl(x + 0.27, y0, cz + 0.1, 0.005, 0.13, 0x4f8a4a);
      kit.ball(x + 0.27, y0 + 0.14, cz + 0.1, 0.032, flowerColors[s % flowerColors.length]);
    }
    if (R(0, 1) < 0.3) {
      kit.ball(x - 0.29, y0 + 0.04, cz - 0.05, 0.04, toyColors[s % toyColors.length]);
    }
  }
}
