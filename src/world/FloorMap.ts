import * as THREE from 'three';
import { CONFIG } from '../config';
import { SECTION_CELLS } from '../data/pets';
import { STR } from '../i18n';
import { canvasTexture, FONT, makeCanvas } from './textures';
import type { World } from './World';

/** 图板在墙上的大小（米） */
const BOARD = { w: 1.9, h: 1.52, y: 1.85 };
const INK = '#e9d3a2';
const DIM = 'rgba(233,211,162,0.55)';

/**
 * 本层总览图的贴图：按进门时的方向画（大门在下，石门在上，左手是 A 区）。
 * 位置都从 CONFIG 里取，大厅改了尺寸图也跟着变。
 */
function mapTexture() {
  const W = 1000;
  const H = 800;
  const [c, ctx] = makeCanvas(W, H);
  const L = CONFIG.hall;
  const G = CONFIG.gallery;
  const s = 30;
  const ox = (W - L.w * s) / 2;
  const oy = 150;
  const X = (x: number) => ox + (x + L.w / 2) * s;
  const Y = (z: number) => oy + (z + L.d) * s;

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

  text(STR.map.title, W / 2, 62, 60);

  // 外墙：下面留出大门，上面是合着的石门
  const hw = L.w / 2;
  const zc = -L.d / 2;
  line(-hw, 0, -hw, -L.d, 4, DIM);
  // 右墙正中是影厅的入口：墙线在这里断开，外面画出门厅
  const door = CONFIG.cinema.door;
  line(hw, 0, hw, zc + door.half, 4, DIM);
  line(hw, zc - door.half, hw, -L.d, 4, DIM);
  ctx.strokeStyle = DIM;
  ctx.lineWidth = 3;
  ctx.strokeRect(X(hw), Y(zc - door.half), door.depth * s, door.half * 2 * s);
  line(-hw, -L.d, hw, -L.d, 4, DIM);
  line(-hw, 0, -L.doorHalf, 0, 4, DIM);
  line(L.doorHalf, 0, hw, 0, 4, DIM);
  line(-L.backDoorHalf, -L.d, L.backDoorHalf, -L.d, 12, '#8f8a82');
  text(STR.map.closed, W / 2, Y(-L.d) - 30, 31, DIM);
  text(STR.map.entrance, W / 2, Y(0) + 34, 34);

  // 三个区，和每个区两头的格号
  const sideHalf = (G.sideCols * G.pitch) / 2;
  /** C 区正中让给影厅入口的那一段，半长 */
  const gapHalf = (G.doorCols * G.pitch) / 2;
  const outer = G.backInner + G.backCols * G.pitch - G.pitch / 2;
  const inner = G.backInner - G.pitch / 2;
  const in1 = 0.45;
  line(-hw + in1, zc + sideHalf, -hw + in1, zc - sideHalf, 10);
  line(hw - in1, zc + sideHalf, hw - in1, zc + gapHalf, 10);
  line(hw - in1, zc - gapHalf, hw - in1, zc - sideHalf, 10);
  line(-outer, -L.d + in1, -inner, -L.d + in1, 10);
  line(inner, -L.d + in1, outer, -L.d + in1, 10);
  const [n1, n2, n3] = SECTION_CELLS;
  text(STR.sectionName('A'), X(-hw) + 34, Y(zc) - 20, 30, INK, 'left');
  text(STR.map.cells(n1), X(-hw) + 34, Y(zc) + 22, 29, DIM, 'left');
  // C 区的名字写在靠后墙的那一半旁边，正中留给影厅
  const cy = Y(zc - (gapHalf + sideHalf) / 2);
  text(STR.sectionName('C'), X(hw) - 34, cy - 20, 30, INK, 'right');
  text(STR.map.cells(n3), X(hw) - 34, cy + 22, 29, DIM, 'right');
  text(STR.map.cinema, X(hw) - 34, Y(zc), 30, INK, 'right');
  text(`${STR.sectionName('B')}  ${STR.map.cells(n2)}`, W / 2, Y(-L.d) + 52, 36);
  // 格号从哪头开始：顺着大厅顺时针走，格号越来越大
  text('1', X(-hw) + 34, Y(zc + sideHalf) - 12, 26, DIM, 'left');
  text(String(n1), X(-hw) + 34, Y(zc - sideHalf) + 12, 26, DIM, 'left');
  // 正面墙两头的格号往里收一点，不和侧墙的格号叠在一起
  text('1', X(-outer) + 70, Y(-L.d) + 52, 26, DIM, 'left');
  text(String(n2), X(outer) - 70, Y(-L.d) + 52, 26, DIM, 'right');
  text('1', X(hw) - 34, Y(zc - sideHalf) + 12, 26, DIM, 'right');
  text(String(n3), X(hw) - 34, Y(zc + sideHalf) - 12, 26, DIM, 'right');

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

/** 电梯旁的本层总览图，挂在门墙里侧 */
export function buildFloorMap(w: World) {
  const { kit } = w;
  const x = CONFIG.hall.mapX;
  const face = -CONFIG.wallT / 2;
  kit.box(x, BOARD.y, face - 0.025, BOARD.w + 0.12, BOARD.h + 0.12, 0.05, CONFIG.colors.woodDark);
  const board = new THREE.Mesh(
    new THREE.PlaneGeometry(BOARD.w, BOARD.h),
    new THREE.MeshBasicMaterial({ map: mapTexture() }),
  );
  board.position.set(x, BOARD.y, face - 0.052);
  board.rotation.y = Math.PI;
  w.scene.add(board);
  kit.glowBox(x, BOARD.y + BOARD.h / 2 + 0.11, face - 0.1, BOARD.w * 0.6, 0.02, 0.03, CONFIG.colors.warm, 2.2);
}
