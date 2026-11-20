import * as THREE from 'three';
import { CONFIG } from '../config';
import { STR } from '../i18n';
import { canvasTexture, drawPaw, FONT, makeCanvas, textMesh } from './textures';
import type { Seat, World } from './World';

const K = CONFIG.cinema;
const D = K.door;
const T = CONFIG.wallT;

/** 颜色：墙和天花板很暗，地毯和座椅是暗红 */
const COL = {
  wall: 0x1d181d,
  ceiling: 0x141115,
  floor: 0x2a171b,
  step: 0x33191f,
  seat: 0x7a2a30,
  seatDark: 0x201b1e,
  curtainA: 0x8a2a33,
  curtainB: 0x6a1f27,
  frame: 0x2a1c1e,
};

// ---------- 大厅这一侧的入口 ----------

/** 大厅右墙朝里的墙面，和入口的中心 */
const HALL_FACE = CONFIG.hall.w / 2 - T / 2;
const DOOR_Z = D.z;
/** 门厅：从墙的外侧往外 depth 米 */
const LOBBY_X0 = CONFIG.hall.w / 2 + T / 2;

/** 从大厅走进门厅这么深，就算进了影厅 */
export function inCinemaDoor(x: number, z: number) {
  return x > LOBBY_X0 + D.enter && x < LOBBY_X0 + D.depth + 1 && Math.abs(z - DOOR_Z) < D.half;
}

/** 从影厅出来以后站在哪：入口里侧，面向大厅 */
export const CINEMA_BACK = { x: HALL_FACE - 1.7, z: DOOR_Z, yaw: Math.PI / 2 };

/** 一排从左到右的帘子褶：贴在一面墙上，along 是沿墙的方向 */
function curtain(w: World, x: number, z: number, alongX: boolean, width: number, height: number, y0 = 0) {
  const n = Math.round(width / 0.2);
  const step = width / n;
  for (let i = 0; i < n; i++) {
    const o = -width / 2 + (i + 0.5) * step;
    const thick = i % 2 ? 0.06 : 0.11;
    const color = i % 2 ? COL.curtainB : COL.curtainA;
    if (alongX) w.kit.box(x + o, y0 + height / 2, z, step + 0.01, height, thick, color);
    else w.kit.box(x, y0 + height / 2, z + o, thick, height, step + 0.01, color);
  }
}

/**
 * 影厅在大厅右墙上的入口：门框、门洞上方发光的招牌、后面一小段挂着帘子的门厅。
 * 门洞本身由 Hall 在砌墙时留出来。
 */
export function buildCinemaEntrance(w: World) {
  const { kit } = w;
  const C = CONFIG.colors;
  const x = CONFIG.hall.w / 2;

  // 门框
  const fx = HALL_FACE - 0.05;
  for (const s of [-1, 1]) kit.box(fx, D.h / 2, DOOR_Z + s * (D.half + 0.07), 0.14, D.h, 0.14, COL.frame);
  kit.box(fx, D.h + 0.07, DOOR_Z, 0.14, 0.14, D.half * 2 + 0.28, COL.frame);

  // 招牌：一块深色的板，上下各一排小灯泡
  const board = { y: 3.55, h: 0.9, w: 3.3 };
  kit.box(HALL_FACE - 0.07, board.y, DOOR_Z, 0.14, board.h, board.w, COL.frame);
  const sign = textMesh(STR.cinemaSign, { height: 0.42, color: '#ffd9a0', glow: 1.9, maxWidth: board.w - 0.5 });
  const now = textMesh(STR.cinemaNow, { height: 0.17, color: '#fff1dc', glow: 1.2, maxWidth: board.w - 0.5 });
  for (const [m, y] of [[sign, board.y + 0.14], [now, board.y - 0.23]] as const) {
    m.position.set(HALL_FACE - 0.15, y, DOOR_Z);
    m.rotation.y = -Math.PI / 2;
    w.scene.add(m);
  }
  const bulbs = 12;
  for (let i = 0; i < bulbs; i++) {
    const z = DOOR_Z - board.w / 2 + 0.12 + (i * (board.w - 0.24)) / (bulbs - 1);
    for (const s of [-1, 1]) kit.glowBall(HALL_FACE - 0.16, board.y + s * (board.h / 2 - 0.07), z, 0.032, i % 2 ? 0xfff0d0 : C.warm, 2.6);
  }
  kit.pool(HALL_FACE - 1.2, DOOR_Z, 3.4, 0xff9a7a, 0.16);

  // 门厅：两侧和尽头的墙、顶、地毯，尽头挂着帘子
  const mid = LOBBY_X0 + D.depth / 2;
  const lh = D.h + 0.2;
  for (const s of [-1, 1]) {
    const z = DOOR_Z + s * (D.half + 0.1);
    kit.box(mid, lh / 2, z, D.depth, lh, 0.2, COL.wall);
    w.collide(mid, z, D.depth, 0.2, true);
  }
  const endX = LOBBY_X0 + D.depth + 0.1;
  kit.box(endX, lh / 2, DOOR_Z, 0.2, lh, D.half * 2 + 0.4, COL.wall);
  w.collide(endX, DOOR_Z, 0.2, D.half * 2 + 0.4, true);
  kit.box(mid + 0.1, lh + 0.05, DOOR_Z, D.depth + 0.2, 0.1, D.half * 2 + 0.4, COL.ceiling);
  kit.box((HALL_FACE + LOBBY_X0 + D.depth) / 2, 0.03, DOOR_Z, LOBBY_X0 + D.depth - HALL_FACE, 0.04, D.half * 2, 0x5a1f26);
  curtain(w, endX - 0.16, DOOR_Z, false, D.half * 2, lh);
  kit.glowBall(mid, lh - 0.12, DOOR_Z, 0.07, C.warm, 1.6);
  w.pointLight(mid - 0.3, 2.3, DOOR_Z, 5, 6);

  w.proxy(x, D.h / 2, DOOR_Z, T + 0.2, D.h, D.half * 2, STR.tipCinema, () => w.hooks.cinema());
}

// ---------- 放映厅 ----------

/** 第 k 排（0 起）的地面比第一排高多少 */
const tierTop = (k: number) => k * K.rise;
/** 第 k 排的台阶从 z 的哪里开始（k ≥ 1） */
const tierStart = (k: number) => K.firstRow + (k - 0.5) * K.rowPitch;

/** 放映厅里的地面高度：一排一排往后升高，最后一排后面的平台和最后一排一样高 */
function floorAt(lz: number) {
  let k = 0;
  while (k < K.rows - 1 && lz >= tierStart(k + 1)) k++;
  return tierTop(k);
}

/** 出入口后面那段门厅有多深；走进去多深就算离开 */
const EXIT = { depth: 1.6, leave: 0.7 };

/** 小人在放映厅里能走动的范围（墙本身有碰撞，这里只是代替主场景的边界） */
export const CINEMA_ROOM = {
  minX: K.x - K.w / 2 - 1,
  maxX: K.x + K.w / 2 + 1,
  minZ: K.z + K.front - 1,
  maxZ: K.z + K.back + T + EXIT.depth + 1,
};

/** 进来时站在哪：后墙门口里侧的平台上，面向银幕 */
export const CINEMA_SPAWN = { x: K.x, z: K.z + K.back - 2.2, facing: 0, yaw: 0, pitch: -0.1 };

/** 走进后墙门洞后面的门厅，就算要离开 */
export function inCinemaExit(x: number, z: number) {
  return z > K.z + K.back + EXIT.leave && Math.abs(x - K.x) < D.half + 0.2;
}

export interface Cinema {
  /** 银幕的画布：画完之后把 texture.needsUpdate 设为 true */
  screen: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; texture: THREE.CanvasTexture };
  /** 银幕没有放映时的画面 */
  idle(): void;
}

export function buildCinema(w: World): Cinema {
  const { kit } = w;
  const C = CONFIG.colors;
  const X = (lx: number) => K.x + lx;
  const Z = (lz: number) => K.z + lz;
  const hw = K.w / 2;
  const len = K.back - K.front;
  const zc = (K.front + K.back) / 2;

  // 地面跟着台阶走
  const outside = w.heightAt;
  w.heightAt = (x, z) => {
    const lx = x - K.x;
    const lz = z - K.z;
    if (Math.abs(lx) < hw + 1 && lz > K.front - 1 && lz < K.back + T + EXIT.depth + 1) return floorAt(lz);
    return outside(x, z);
  };

  // ---------- 地面、台阶 ----------
  kit.box(X(0), -0.02, Z(zc), K.w + T, 0.04, len + T, COL.floor);
  for (let k = 1; k < K.rows; k++) {
    const z0 = tierStart(k);
    kit.box(X(0), tierTop(k) - K.rise / 2, Z((z0 + K.back) / 2), K.w, K.rise, K.back - z0, k % 2 ? COL.step : COL.floor);
    // 台阶边上的一线地脚灯：只在过道里
    const nose = Z(z0 - 0.02);
    kit.glowBox(X(0), tierTop(k) - 0.03, nose, K.aisle - 0.2, 0.02, 0.02, C.warm, 1.3);
    for (const s of [-1, 1]) kit.glowBox(X(s * (hw - 0.65)), tierTop(k) - 0.03, nose, 0.9, 0.02, 0.02, C.warm, 1.3);
  }

  // ---------- 墙、天花板 ----------
  const wallBox = (lx: number, lz: number, sx: number, sz: number, h = K.h, y0 = 0) => {
    kit.box(X(lx), y0 + h / 2, Z(lz), sx, h, sz, COL.wall);
    if (y0 === 0) w.collide(X(lx), Z(lz), sx, sz, true);
  };
  wallBox(0, K.front - T / 2, K.w + T * 2, T);
  for (const s of [-1, 1]) wallBox(s * (hw + T / 2), zc, T, len + T * 2);
  // 后墙：正中是门洞
  const sideLen = hw - D.half;
  for (const s of [-1, 1]) wallBox(s * (D.half + sideLen / 2), K.back + T / 2, sideLen, T);
  const top = tierTop(K.rows - 1);
  wallBox(0, K.back + T / 2, D.half * 2, T, K.h - D.h - top, top + D.h);
  // 门洞后面的门厅，尽头挂着帘子
  const ez0 = K.back + T;
  const lh = top + D.h + 0.2;
  for (const s of [-1, 1]) wallBox(s * (D.half + 0.1), ez0 + EXIT.depth / 2, 0.2, EXIT.depth, lh);
  wallBox(0, ez0 + EXIT.depth + 0.1, D.half * 2 + 0.4, 0.2, lh);
  kit.box(X(0), lh + 0.05, Z(ez0 + EXIT.depth / 2), D.half * 2 + 0.4, 0.1, EXIT.depth + 0.2, COL.ceiling);
  kit.box(X(0), top - 0.02, Z(ez0 + EXIT.depth / 2 - T / 2), D.half * 2, 0.04, EXIT.depth + T, 0x5a1f26);
  curtain(w, X(0), Z(ez0 + EXIT.depth - 0.06), true, D.half * 2, lh - top, top);
  // 天花板只有朝下的一面：镜头抬到天花板以上时，仍然能看进厅里
  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(K.w + T * 2, len + T * 2).rotateX(Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: COL.ceiling, roughness: 1 }),
  );
  ceiling.position.set(X(0), K.h, Z(zc));
  ceiling.castShadow = true;
  w.scene.add(ceiling);

  // 出口上方的牌子
  const exitY = top + D.h + 0.38;
  kit.box(X(0), exitY, Z(K.back - 0.03), 1.3, 0.36, 0.06, COL.frame);
  const exit = textMesh(STR.cinemaExit, { height: 0.24, color: '#bfe8c8', glow: 1.5, maxWidth: 1.15 });
  exit.position.set(X(0), exitY, Z(K.back - 0.07));
  exit.rotation.y = Math.PI;
  w.scene.add(exit);

  // ---------- 银幕 ----------
  const S = K.screen;
  const sz = K.front + 0.08;
  kit.box(X(0), S.y, Z(K.front + 0.03), S.w + 0.3, S.h + 0.3, 0.06, 0x0b0a0c);
  const [canvas, ctx] = makeCanvas(1024, 576);
  const texture = canvasTexture(canvas);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(S.w, S.h), new THREE.MeshBasicMaterial({ map: texture }));
  screen.position.set(X(0), S.y, Z(sz));
  w.scene.add(screen);
  // 银幕两侧收起来的帘子
  const side = (K.w - S.w) / 2 - 0.35;
  for (const s of [-1, 1]) curtain(w, X(s * (S.w / 2 + 0.25 + side / 2)), Z(K.front + 0.12), true, side, K.h - 0.3);
  kit.box(X(0), K.h - 0.35, Z(K.front + 0.14), K.w, 0.7, 0.14, COL.curtainB);

  const idle = () => {
    const { width: W, height: H } = canvas;
    const g = ctx.createRadialGradient(W / 2, H * 0.48, 20, W / 2, H * 0.48, W * 0.6);
    g.addColorStop(0, '#2a2019');
    g.addColorStop(1, '#0d0a09');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    drawPaw(ctx, W / 2, H * 0.36, 130, 'rgba(255,217,160,0.85)');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffd9a0';
    ctx.font = `600 58px ${FONT}`;
    ctx.fillText(STR.brand, W / 2, H * 0.6, W - 120);
    ctx.fillStyle = 'rgba(255,241,220,0.7)';
    ctx.font = `500 28px ${FONT}`;
    ctx.fillText(STR.cinemaIdle, W / 2, H * 0.72, W - 120);
    texture.needsUpdate = true;
  };
  idle();

  // ---------- 座位 ----------
  for (let k = 0; k < K.rows; k++) {
    const lz = K.firstRow + k * K.rowPitch;
    const y = tierTop(k);
    for (const s of [-1, 1]) {
      const first = K.aisle / 2 + K.seatPitch / 2;
      for (let i = 0; i < K.seatsPerSide; i++) {
        const lx = s * (first + i * K.seatPitch);
        kit.box(X(lx), y + 0.16, Z(lz + 0.05), 0.6, 0.32, 0.5, COL.seatDark);
        kit.box(X(lx), y + 0.37, Z(lz), 0.64, 0.12, 0.56, COL.seat);
        kit.box(X(lx), y + 0.74, Z(lz + 0.33), 0.64, 0.78, 0.12, COL.seat);
        // 坐面朝银幕（-Z），从前面的过道走过来坐下
        const before = w.seats.length;
        w.seat('cinema', X(lx), Z(lz), 0.43, 0, -1, 0.65, [X(0), X(s * (hw - 0.7))]);
        const seat: Seat[] = w.seats.slice(before);
        w.proxy(X(lx), y + 0.62, Z(lz + 0.1), 0.7, 1.1, 0.72, STR.tipSeat, () => w.hooks.sit(seat));
      }
      // 扶手：每个座位两侧
      for (let i = 0; i <= K.seatsPerSide; i++) {
        kit.box(X(s * (K.aisle / 2 + i * K.seatPitch)), y + 0.5, Z(lz + 0.06), 0.08, 0.1, 0.5, COL.seatDark);
      }
      const width = K.seatsPerSide * K.seatPitch + 0.1;
      w.collide(X(s * (K.aisle / 2 + (K.seatsPerSide * K.seatPitch) / 2)), Z(lz + 0.1), width, 0.7);
    }
    // 中间过道两边的地脚灯
    for (const s of [-1, 1]) kit.glowBall(X(s * (K.aisle / 2 - 0.08)), y + 0.05, Z(lz + 0.3), 0.028, C.warm, 1.6);
  }

  // ---------- 灯 ----------
  // 银幕映到厅里的一点冷光
  w.pointLight(X(0), S.y, Z(K.front + 3), 16, 18, 0xbfc8e0);
  // 两侧墙上的壁灯和后门口的灯，都很暗
  for (const s of [-1, 1]) {
    const lz = K.firstRow + ((K.rows - 1) * K.rowPitch) / 2;
    kit.box(X(s * (hw - 0.05)), 2.75, Z(lz), 0.1, 0.06, 0.16, 0x2b2b33);
    kit.glowBall(X(s * (hw - 0.14)), 2.88, Z(lz), 0.08, C.warm, 1.5);
    w.pointLight(X(s * (hw - 1.2)), 2.9, Z(lz), 9, 11);
  }
  w.pointLight(X(0), top + 2.4, Z(K.back - 1.2), 8, 9);

  return { screen: { canvas, ctx, texture }, idle };
}
