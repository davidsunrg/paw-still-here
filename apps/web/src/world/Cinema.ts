import * as THREE from 'three';
import { CONFIG } from '../config';
import { STR } from '../i18n';
import { canvasTexture, drawPaw, FONT, makeCanvas, textMesh } from './textures';
import type { World } from './World';

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
  cushion: 0xd8c3a6,
  cushionB: 0xc2a98c,
  accent: 0xd57a3d,
  rug: 0x3a2126,
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

/** 放映室里的地面高度：后排平台比前区高一点，只有一级矮台阶 */
function floorAt(lz: number) {
  return lz >= K.stepZ ? K.rise : 0;
}

/** 出入口后面那段门厅有多深；走进去多深就算离开 */
const EXIT = { depth: 1.6, leave: 0.7 };

/** 小人在放映室里能走动的范围（墙本身有碰撞，这里只是代替主场景的边界） */
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

  // ---------- 地面、后排的一级矮平台 ----------
  kit.box(X(0), -0.02, Z(zc), K.w + T, 0.04, len + T, COL.floor);
  if (K.rise > 0) {
    kit.box(X(0), K.rise / 2, Z((K.stepZ + K.back) / 2), K.w, K.rise, K.back - K.stepZ, COL.step);
    kit.glowBox(X(0), K.rise - 0.015, Z(K.stepZ - 0.02), K.w - 0.9, 0.02, 0.02, C.warm, 1.2);
  }

  // ---------- 墙、天花板 ----------
  const top = K.rise;
  const wallBox = (lx: number, lz: number, sx: number, sz: number, h = K.h, y0 = 0) => {
    kit.box(X(lx), y0 + h / 2, Z(lz), sx, h, sz, COL.wall);
    if (y0 === 0) w.collide(X(lx), Z(lz), sx, sz, true);
  };
  wallBox(0, K.front - T / 2, K.w + T * 2, T);
  for (const s of [-1, 1]) wallBox(s * (hw + T / 2), zc, T, len + T * 2);
  // 后墙：正中是门洞
  const sideLen = hw - D.half;
  for (const s of [-1, 1]) wallBox(s * (D.half + sideLen / 2), K.back + T / 2, sideLen, T);
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

  // ---------- 两排三人沙发 ----------
  const sofaWidth = K.sofa.width;
  const sofaDepth = K.sofa.depth;
  const seatCount = K.sofa.seats;
  // 地毯铺在前排和银幕之间
  kit.box(X(0), 0.006, Z(-2.1), 4.8, 0.012, 4.2, COL.rug);
  for (let row = 0; row < K.rows; row++) {
    const z = K.rowZ[row]!;
    const y = row === 0 ? 0 : K.rise;
    const before = w.seats.length;
    // 沙发主体：底座、坐面、靠背、两侧扶手、四只脚
    kit.box(X(0), y + 0.17, Z(z + 0.02), sofaWidth, 0.34, sofaDepth, COL.seatDark);
    kit.box(X(0), y + 0.36, Z(z - 0.02), sofaWidth - 0.1, 0.14, sofaDepth - 0.16, COL.seat);
    kit.box(X(0), y + 0.62, Z(z + 0.36), sofaWidth, 0.6, 0.18, COL.seat);
    for (const s of [-1, 1]) {
      kit.box(X(s * (sofaWidth / 2 + 0.09)), y + 0.4, Z(z + 0.02), 0.18, 0.62, sofaDepth, COL.seatDark);
      for (const t of [-1, 1]) kit.box(X(s * (sofaWidth / 2 - 0.1)), y + 0.05, Z(z + t * (sofaDepth / 2 - 0.1)), 0.09, 0.1, 0.09, COL.seatDark);
    }
    const cw = (sofaWidth - 0.08) / seatCount;
    for (let i = 0; i < seatCount; i++) {
      const sx = (i - (seatCount - 1) / 2) * cw;
      kit.box(X(sx), y + 0.44, Z(z - 0.07), cw - 0.04, 0.16, sofaDepth - 0.3, COL.seat);
      kit.box(X(sx), y + 0.6, Z(z + 0.24), cw - 0.1, 0.38, 0.14, i % 2 ? COL.cushionB : COL.cushion);
      // 坐面朝银幕（-Z），从沙发前面走过来坐下
      w.seat('cinema', X(sx), Z(z - 0.05), y + 0.48, 0, -1, 0.8);
    }
    // 两边的抱枕
    kit.box(X(-0.72), y + 0.56, Z(z + 0.08), 0.38, 0.34, 0.14, COL.accent);
    kit.box(X(0.72), y + 0.56, Z(z + 0.08), 0.38, 0.34, 0.14, COL.cushion);
    const seats = w.seats.slice(before);
    w.collide(X(0), Z(z), sofaWidth + 0.45, sofaDepth + 0.12);
    w.proxy(X(0), y + 0.65, Z(z + 0.02), sofaWidth + 0.2, 1.15, sofaDepth + 0.2, STR.tipSeat, () => w.hooks.sit(seats));
    // 两侧小边桌和桌上的小灯
    for (const s of [-1, 1]) {
      const lx = s * (sofaWidth / 2 + 0.52);
      kit.cyl(X(lx), y, Z(z), 0.03, 0.48, COL.frame);
      kit.cyl(X(lx), y + 0.48, Z(z), 0.3, 0.04, C.wood);
      kit.glowBall(X(lx), y + 0.62, Z(z), 0.055, C.warm, 1.4);
      w.collide(X(lx), Z(z), 0.48, 0.48);
    }
  }

  // ---------- 灯 ----------
  // 银幕映到厅里的一点冷光
  w.pointLight(X(0), S.y, Z(K.front + 3), 12, 16, 0xbfc8e0);
  // 两侧墙上的壁灯和后门口的灯，都很暗
  for (const s of [-1, 1]) {
    const lz = 0;
    kit.box(X(s * (hw - 0.05)), 2.55, Z(lz), 0.1, 0.06, 0.16, 0x2b2b33);
    kit.glowBall(X(s * (hw - 0.14)), 2.68, Z(lz), 0.08, C.warm, 1.5);
    w.pointLight(X(s * (hw - 1.1)), 2.7, Z(lz), 7, 10);
  }
  w.pointLight(X(0), top + 2.4, Z(K.back - 1.2), 8, 9);

  return { screen: { canvas, ctx, texture }, idle };
}
