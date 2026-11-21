import * as THREE from 'three';
import { CONFIG } from '../config';
import { SECTION_CELLS, SECTIONS } from '../data/pets';
import { STR } from '../i18n';
import { canvasTexture, FONT, makeCanvas } from './textures';
import type { World } from './World';

/** 图板在墙上的大小（米） */
const BOARD = { w: 1.9, h: 1.52, y: 1.85 };
const INK = '#e9d3a2';
const DIM = 'rgba(233,211,162,0.55)';

/** 两种空间的图：一层大厅有大门、影厅和河；楼上是同一个大厅，但没有这三处 */
export type FloorVariant = 'lobby' | 'upper';

/**
 * 本层总览图的贴图：按进门时的方向画（大门在下，石门在上，左手是 A 区）。
 * 位置都从 CONFIG 里取，大厅改了尺寸图也跟着变。
 */
function mapTexture(floor: number, variant: FloorVariant) {
  const upper = variant === 'upper';
  const W = 1000;
  const H = 800;
  const [c, ctx] = makeCanvas(W, H);
  const L = CONFIG.hall;
  const G = CONFIG.gallery;
  const Wing = G.wing;
  const s = 19;
  const ox = (W - L.w * s) / 2;
  const oy = 70;
  const X = (x: number) => ox + (x + L.w / 2) * s;
  const Y = (z: number) => oy + (z - Wing.backZ) * s;

  ctx.fillStyle = '#2b2622';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = DIM;
  ctx.lineWidth = 3;
  ctx.strokeRect(14, 14, W - 28, H - 28);

  const text = (t: string, x: number, y: number, size: number, color = INK, align: CanvasTextAlign = 'center') => {
    ctx.font = `600 ${size}px ${FONT}`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillText(t, x, y);
  };
  const line = (x0: number, z0: number, x1: number, z1: number, width: number, color = INK) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(X(x0), Y(z0));
    ctx.lineTo(X(x1), Y(z1));
    ctx.stroke();
  };

  text(upper ? STR.map.upperTitle(floor) : STR.map.floorTitle(floor), W / 2, 62, 60);

  // 外墙：下面留出大门，上面是合着的石门
  const hw = L.w / 2;
  const zc = -L.d / 2;
  line(-hw, 0, -hw, -L.d, 4, DIM);
  if (upper) {
    // 楼上没有影厅和河的入口，右墙是一整面
    line(hw, 0, hw, -L.d, 4, DIM);
  } else {
    // 右墙上是影厅和河的入口：墙线在门洞处断开，外面画出门洞后面的那一小段
    const doors = [
      { ...CONFIG.cinema.door, name: STR.map.cinema },
      { ...CONFIG.cave.door, name: STR.map.cave },
    ];
    let from = 0;
    ctx.lineWidth = 3;
    for (const door of doors) {
      line(hw, from, hw, door.z + door.half, 4, DIM);
      from = door.z - door.half;
      ctx.strokeStyle = DIM;
      ctx.lineWidth = 3;
      ctx.strokeRect(X(hw), Y(door.z - door.half), door.depth * s, door.half * 2 * s);
      text(door.name, X(hw) - 22, Y(door.z), 30, INK, 'right');
    }
    line(hw, from, hw, -L.d, 4, DIM);
  }
  // 后墙：门洞两侧，中间通向后展区
  line(-hw, -L.d, -L.backDoorHalf, -L.d, 4, DIM);
  line(L.backDoorHalf, -L.d, hw, -L.d, 4, DIM);
  line(-Wing.corridorHalf, -L.d, -Wing.corridorHalf, Wing.corridorEnd, 3, DIM);
  line(Wing.corridorHalf, -L.d, Wing.corridorHalf, Wing.corridorEnd, 3, DIM);
  // 新展区的两侧和尽头
  line(-hw, -L.d, -hw, Wing.backZ, 4, DIM);
  line(hw, -L.d, hw, Wing.backZ, 4, DIM);
  line(-hw, Wing.backZ, hw, Wing.backZ, 4, DIM);
  if (upper) {
    // 楼上的大门那面是整墙，没有出口
    line(-hw, 0, hw, 0, 4, DIM);
  } else {
    line(-hw, 0, -L.doorHalf, 0, 4, DIM);
    line(L.doorHalf, 0, hw, 0, 4, DIM);
    text(STR.map.entrance, W / 2, Y(0) + 34, 34);
  }

  // 两个区，和每个区两头的格号
  const sideHalf = (G.sideCols * G.pitch) / 2;
  const outer = G.backInner + G.backCols * G.pitch - G.pitch / 2;
  const inner = G.backInner - G.pitch / 2;
  const in1 = 0.45;
  line(-hw + in1, zc + sideHalf, -hw + in1, zc - sideHalf, 10);
  line(-outer, -L.d + in1, -inner, -L.d + in1, 10);
  line(inner, -L.d + in1, outer, -L.d + in1, 10);
  const [n1, n2] = SECTION_CELLS;
  text(STR.sectionName('A'), X(-hw) + 34, Y(zc) - 20, 30, INK, 'left');
  text(STR.map.cells(n1), X(-hw) + 34, Y(zc) + 22, 29, DIM, 'left');
  text(`${STR.sectionName('B')}  ${STR.map.cells(n2)}`, W / 2, Y(-L.d) + 52, 36);
  // 格号从哪头开始：顺着大厅顺时针走，格号越来越大
  text('1', X(-hw) + 34, Y(zc + sideHalf) - 12, 26, DIM, 'left');
  text(String(n1), X(-hw) + 34, Y(zc - sideHalf) + 12, 26, DIM, 'left');
  // 正面墙两头的格号往里收一点，不和侧墙的格号叠在一起
  text('1', X(-outer) + 70, Y(-L.d) + 52, 26, DIM, 'left');
  text(String(n2), X(outer) - 70, Y(-L.d) + 52, 26, DIM, 'right');

  // 后展区：三排双面墙，C–H
  text(STR.wingTitle, X(0), Y(Wing.corridorEnd) - 12, 26, DIM);
  Wing.wallZ.forEach((z, i) => {
    line(-Wing.length / 2, z, Wing.length / 2, z, 8);
    const front = SECTIONS[2 + i * 2]!;
    const back = SECTIONS[3 + i * 2]!;
    text(`${STR.sectionName(front)} · ${STR.map.cells(SECTION_CELLS[2 + i * 2]!)}`, X(0), Y(z + 0.7), 22, DIM);
    text(`${STR.sectionName(back)} · ${STR.map.cells(SECTION_CELLS[3 + i * 2]!)}`, X(0), Y(z - 0.7), 22, DIM);
  });

  // 纪念树和两侧的沙发
  ctx.strokeStyle = INK;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(X(0), Y(zc), 2.5 * s, 0, Math.PI * 2);
  ctx.stroke();
  text(STR.map.tree, X(0), Y(zc), 36);
  ctx.strokeStyle = DIM;
  ctx.lineWidth = 3;
  for (const side of [-1, 1]) ctx.strokeRect(X(side * L.sofaX) - 0.5 * s, Y(zc) - 1.4 * s, s, 2.8 * s);

  // 门墙两侧：接待台、电梯
  ctx.beginPath();
  ctx.arc(X(L.receptionX), Y(-0.6), 2.7 * s, Math.PI * 1.12, Math.PI * 1.88);
  ctx.stroke();
  text(STR.map.reception, X(L.receptionX), Y(-1.6), 31);
  ctx.strokeRect(X(L.elevatorX) - 1.2 * s, Y(-0.9), 2.4 * s, 0.7 * s);
  // 右端对齐电梯的右边，给「你在这里」留出位置
  text(STR.map.elevator, X(L.elevatorX) + 1.2 * s, Y(-1.7), 31, INK, 'right');

  // 你在这里
  const hx = X(L.mapX);
  const hy = Y(-1.3);
  ctx.fillStyle = '#ffb45a';
  ctx.beginPath();
  ctx.arc(hx, hy, 9, 0, Math.PI * 2);
  ctx.fill();
  text(STR.map.here, hx + 18, hy, 29, '#ffb45a', 'left');

  return canvasTexture(c);
}

export interface FloorMapHandle {
  setFloor(floor: number): void;
}

/** 电梯旁的本层总览图，挂在门墙里侧；换楼层时只换贴图 */
export function buildFloorMap(w: World, origin: { x: number; z: number } = { x: 0, z: 0 }, variant: FloorVariant = 'lobby'): FloorMapHandle {
  const { kit } = w;
  const x = origin.x + CONFIG.hall.mapX;
  const face = origin.z - CONFIG.wallT / 2;
  kit.box(x, BOARD.y, face - 0.025, BOARD.w + 0.12, BOARD.h + 0.12, 0.05, CONFIG.colors.woodDark);
  const material = new THREE.MeshBasicMaterial({ map: mapTexture(1, variant) });
  const board = new THREE.Mesh(new THREE.PlaneGeometry(BOARD.w, BOARD.h), material);
  board.position.set(x, BOARD.y, face - 0.052);
  board.rotation.y = Math.PI;
  w.scene.add(board);
  kit.glowBox(x, BOARD.y + BOARD.h / 2 + 0.11, face - 0.1, BOARD.w * 0.6, 0.02, 0.03, CONFIG.colors.warm, 2.2);
  return {
    setFloor(floor: number) {
      const old = material.map;
      material.map = mapTexture(floor, variant);
      material.needsUpdate = true;
      old?.dispose();
    },
  };
}
