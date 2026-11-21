import * as THREE from 'three';
import { CONFIG } from '../config';
import { STR } from '../i18n';
import { plant, sofa } from './parts';
import { pawTexture, textMesh } from './textures';
import type { Seat, World } from './World';

/** 大厅里反复出现的那几件陈设，一层和楼上共用；原点是大厅中心 */
export interface DressingOrigin {
  x: number;
  z: number;
}

/** 头顶的串灯和几盏主灯（中间让开树冠） */
export function buildStringLights(w: World, o: DressingOrigin) {
  const { kit } = w;
  const C = CONFIG.colors;
  const H = CONFIG.wallH;
  const hw = CONFIG.hall.w / 2;
  const L = CONFIG.hall;
  for (const z of L.stringZ) {
    const n = 30;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const y = H - 0.15 - 1.1 * 4 * t * (1 - t);
      kit.glowBall(o.x - hw + 0.3 + t * (L.w - 0.6), y, o.z + z + Math.sin(t * 9 + z) * 0.08, 0.045, i % 3 ? C.warm : 0xfff0d0, 3);
    }
  }
  w.pointLight(o.x, 4.3, o.z - 3.4, 30, 22);
  // 两侧墙和正面墙前的灯
  for (const s of [-1, 1]) {
    w.pointLight(o.x + s * 8, 3.4, o.z - CONFIG.hall.d / 2, 34, 22);
    w.pointLight(o.x + s * 6.4, 3.4, o.z - CONFIG.hall.d + 3.5, 24, 18);
  }
}

/** 大厅正中两侧的沙发和地毯；zone 决定模拟访客会不会来坐 */
export function buildHallSofas(w: World, o: DressingOrigin, zone: Seat['zone'] = 'hall') {
  const { kit } = w;
  const L = CONFIG.hall;
  const zc = o.z - CONFIG.hall.d / 2;
  for (const s of [-1, 1]) {
    kit.box(o.x + s * (L.sofaX - 0.5), 0.055, zc, 2.6, 0.03, 3.8, 0x6f5560);
    kit.box(o.x + s * (L.sofaX - 0.5), 0.062, zc, 2.2, 0.03, 3.4, 0x86697a);
    const before = w.seats.length;
    sofa(w, o.x + s * L.sofaX, zc, -s * Math.PI / 2, 2.6, 0x7f93a8, 0x9db0c4, zone);
    const seats = w.seats.slice(before);
    w.proxy(o.x + s * L.sofaX, 0.5, zc, 1.0, 1.0, 2.9, STR.tipBench, () => w.hooks.sit(seats));
  }
}

/** 接待台（大门东侧，背靠门墙，弧形） */
export function buildReception(w: World, o: DressingOrigin) {
  const { kit, scene } = w;
  const C = CONFIG.colors;
  const T = CONFIG.wallT;
  const L = CONFIG.hall;
  const cx = o.x + L.receptionX;
  const cz = o.z - 0.6;
  const rad = 2.7;
  const seg = 7;
  const a0 = THREE.MathUtils.degToRad(112);
  const a1 = THREE.MathUtils.degToRad(248);
  /** 弧上的一点：180° 正对大厅里面，off 是往外（访客一侧）偏多少 */
  const deskAt = (deg: number, off = 0): [number, number] => {
    const a = THREE.MathUtils.degToRad(deg);
    return [cx + Math.sin(a) * (rad + off), cz + Math.cos(a) * (rad + off)];
  };
  for (let i = 0; i < seg; i++) {
    const a = a0 + ((i + 0.5) / seg) * (a1 - a0);
    const x = cx + Math.sin(a) * rad;
    const z = cz + Math.cos(a) * rad;
    const ry = Math.atan2(-Math.sin(a), -Math.cos(a));
    kit.box(x, 0.52, z, 1.0, 1.04, 0.42, C.wood, ry);
    kit.box(x + Math.sin(a) * 0.03, 1.07, z + Math.cos(a) * 0.03, 1.06, 0.06, 0.62, C.woodLight, ry);
    kit.glowBox(x + Math.sin(a) * 0.23, 0.14, z + Math.cos(a) * 0.23, 0.96, 0.03, 0.03, C.warm, 2.2, ry);
    w.collide(x, z, 0.9, 0.9);
  }
  // 台面上的爪印标志
  const logo = new THREE.Mesh(
    new THREE.PlaneGeometry(0.62, 0.62),
    new THREE.MeshBasicMaterial({ map: pawTexture(), transparent: true, depthWrite: false, color: new THREE.Color(C.warm).multiplyScalar(1.8) }),
  );
  const [gx, gz] = deskAt(180, 0.22);
  logo.position.set(gx, 0.62, gz);
  logo.rotation.y = Math.PI;
  scene.add(logo);
  // 台灯
  const [tx, tz] = deskAt(141);
  kit.cyl(tx, 1.1, tz, 0.09, 0.03, 0x2b2b33);
  kit.cyl(tx, 1.1, tz, 0.015, 0.32, 0x2b2b33);
  kit.glowCyl(tx, 1.38, tz, 0.12, 0.17, 0xffd9a0, 2.4);
  // 花
  const [fx, fz] = deskAt(219);
  kit.cyl(fx, 1.1, fz, 0.09, 0.18, 0xe9e2d6);
  for (const [ox, oy, oz, col] of [[0, 0.42, 0, 0xffb7c5], [0.09, 0.36, 0.04, 0xfff2a8], [-0.08, 0.34, -0.05, 0xffffff], [0.02, 0.33, 0.1, 0xffd08a]]) {
    kit.ball(fx + ox, 1.1 + oy, fz + oz, 0.075, col);
  }
  kit.ball(fx, 1.36, fz, 0.13, 0x4c9563, 0.8);
  // 招财猫一样守在台边的小猫摆件
  const [mx, mz] = deskAt(160);
  kit.ball(mx, 1.22, mz, 0.12, 0xfaf6ee, 1.05);
  kit.ball(mx, 1.4, mz - 0.02, 0.095, 0xfaf6ee);
  kit.cone(mx - 0.055, 1.46, mz - 0.02, 0.035, 0.07, 0xfaf6ee);
  kit.cone(mx + 0.055, 1.46, mz - 0.02, 0.035, 0.07, 0xfaf6ee);
  kit.ball(mx - 0.035, 1.4, mz - 0.11, 0.014, 0x2a2320);
  kit.ball(mx + 0.035, 1.4, mz - 0.11, 0.014, 0x2a2320);
  kit.ball(mx, 1.3, mz - 0.07, 0.03, 0xe0504a);

  // 只罩住台面：矮盒子贴在脚边会把点地面的射线也拦成「找宠物」
  const [rx, rz] = deskAt(180, 0.08);
  w.proxy(rx, 1.02, rz + 0.18, 3.2, 0.45, 0.95, STR.tipReception, () => w.hooks.reception());
  w.pointLight(cx, 3.0, cz - 2.6, 26, 16);

  // 背景墙：发光的馆名
  const faceZ = o.z - T / 2;
  const name = textMesh(STR.brand, { height: 0.62, color: '#ffd9a0', glow: 2.0, maxWidth: 5.6 });
  name.position.set(cx, 3.35, faceZ - 0.07);
  name.rotation.y = Math.PI;
  const sub = textMesh(STR.taglineShort, { height: 0.24, color: '#fff1dc', glow: 1.25, maxWidth: 5.6 });
  sub.position.set(cx, 2.72, faceZ - 0.07);
  sub.rotation.y = Math.PI;
  scene.add(name, sub);
  kit.box(cx, 3.1, faceZ - 0.03, 6.2, 1.7, 0.05, 0x5a4636);
  // 背景墙下的矮柜
  kit.box(cx, 0.45, faceZ - 0.3, 3.4, 0.9, 0.5, C.woodDark);
  kit.box(cx, 0.92, faceZ - 0.3, 3.5, 0.05, 0.56, C.woodLight);
  for (const dx of [-1.2, 0, 1.2]) {
    kit.cyl(cx + dx, 0.95, faceZ - 0.3, 0.045, 0.14, 0xf6ecd8);
    kit.flame(cx + dx, 1.13, faceZ - 0.3, 0.024);
  }
  w.collide(cx, faceZ - 0.3, 3.5, 0.6);
}

/** 门墙西侧的电梯（只有门，楼层由顶部的选择器切换） */
export function buildElevator(w: World, o: DressingOrigin) {
  const { kit, scene } = w;
  const C = CONFIG.colors;
  const T = CONFIG.wallT;
  const L = CONFIG.hall;
  const ex = o.x + L.elevatorX;
  const faceZ = o.z - T / 2;
  const metal = 0x4a4540;
  kit.box(ex, 1.3, faceZ - 0.05, 2.5, 2.6, 0.1, metal);
  for (const s of [-1, 1]) kit.box(ex + s * 0.5, 1.14, faceZ - 0.11, 0.98, 2.2, 0.03, 0xa39a8c);
  kit.box(ex, 1.14, faceZ - 0.125, 0.02, 2.2, 0.01, 0x2b2824);
  kit.glowBox(ex, 2.28, faceZ - 0.11, 2.0, 0.02, 0.02, C.warm, 1.6);
  // 门楣上的楼层数字
  kit.box(ex, 2.95, faceZ - 0.04, 1.0, 0.36, 0.06, 0x2b2824);
  const floorNo = textMesh(STR.floorNumber, { height: 0.2, color: '#ffd9a0', glow: 2.0, maxWidth: 0.9 });
  floorNo.position.set(ex, 2.95, faceZ - 0.08);
  floorNo.rotation.y = Math.PI;
  scene.add(floorNo);
  // 门边的呼叫面板
  kit.box(ex - 1.5, 1.2, faceZ - 0.03, 0.14, 0.3, 0.04, 0x2b2824);
  kit.glowBall(ex - 1.5, 1.2, faceZ - 0.06, 0.022, C.warm, 1.6);
  w.collide(ex, faceZ - 0.08, 2.5, 0.16);
}

/** 大门里侧的两盆植物 */
export function buildDoorPlants(w: World, o: DressingOrigin) {
  for (const s of [-1, 1]) plant(w, o.x + s * 2.85, o.z - 0.95, 1.15);
}
