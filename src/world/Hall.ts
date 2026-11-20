import * as THREE from 'three';
import { CONFIG, ZONES } from '../config';
import { STR } from '../i18n';
import { buildCaveEntrance } from './Cave';
import { buildCinemaEntrance } from './Cinema';
import { buildFloorMap } from './FloorMap';
import { archWall, doorWall, plant, sofa, wallStrip } from './parts';
import { buildTree } from './Tree';
import { pawTexture, plankTexture, textMesh } from './textures';
import type { World } from './World';

/** 大厅：正中是纪念树，左墙和正面墙是照片墙（见 Gallery.ts），门墙两侧是接待台和电梯，右墙是影厅和河的入口（见 Cinema.ts、Cave.ts） */
export function buildHall(w: World) {
  const { kit, scene } = w;
  const C = CONFIG.colors;
  const H = CONFIG.wallH;
  const T = CONFIG.wallT;
  const hw = CONFIG.hall.w / 2;
  const d = CONFIG.hall.d;
  const zc = -d / 2;
  const L = CONFIG.hall;

  // ---------- 地面 ----------
  const planks = plankTexture();
  planks.repeat.set(CONFIG.hall.w / 2.4, d / 2.4);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(CONFIG.hall.w, d).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ map: planks, roughness: 0.55, color: 0xe6d2bb }),
  );
  floor.position.set(0, 0.04, zc);
  floor.receiveShadow = true;
  scene.add(floor);

  // ---------- 墙 ----------
  archWall(w, ZONES.hallFront, CONFIG.hall.w + T, CONFIG.hall.doorHalf, CONFIG.hall.doorSpring, true);
  archWall(w, ZONES.hallBack, CONFIG.hall.w + T, L.backDoorHalf, L.backDoorSpring);
  // 左墙是一整面；右墙不挂照片，开着两个门洞：靠大门一侧是影厅，靠后墙一侧是河
  kit.box(-hw, H / 2, zc, T, H, d + T, C.wall);
  w.collide(-hw, zc, T, d + T, true);
  const theater = CONFIG.cinema.door;
  const cave = CONFIG.cave.door;
  doorWall(w, hw, -d - T / 2, T / 2, [
    { z: theater.z, half: theater.half, h: theater.h },
    { z: cave.z, half: cave.half, spring: cave.spring },
  ]);
  buildCinemaEntrance(w);
  buildCaveEntrance(w);
  // 两个门洞之间的墙面上的一行字，和左墙的那一行对着
  const stay = textMesh(STR.wallTitleRight, { height: 0.4, color: '#6b4a2e', maxWidth: 4.6 });
  stay.position.set(hw - T / 2 - 0.02, 2.55, (theater.z + cave.z) / 2);
  stay.rotation.y = -Math.PI / 2;
  scene.add(stay);
  for (const sx of [-1, 1]) {
    wallStrip(kit, sx * hw, zc, 0, d + T);
    for (const z of [ZONES.hallFront, ZONES.hallBack]) {
      kit.box(sx * hw, (H + 0.3) / 2, z, 0.75, H + 0.3, 0.75, 0xc8bca9);
      kit.glowBall(sx * hw, H + 0.52, z, 0.2, C.warm, 2.4);
    }
  }
  wallStrip(kit, 0, ZONES.hallFront, CONFIG.hall.w, 0);
  wallStrip(kit, 0, ZONES.hallBack, CONFIG.hall.w, 0);

  // 大门外两侧的迎客灯与盆栽
  for (const sx of [-1, 1]) {
    kit.glowBall(sx * 3.1, 2.5, T / 2 + 0.14, 0.14, C.warm, 2.6);
    kit.pool(sx * 3.1, 1.3, 5, C.warm, 0.28);
    plant(w, sx * 3.5, 0.9, 1.1);
  }
  const doorName = textMesh(STR.brand, { height: 0.42, color: '#ffd9a0', glow: 1.9, maxWidth: 6 });
  doorName.position.set(0, 4.72, T / 2 + 0.02);
  scene.add(doorName);

  // ---------- 头顶的串灯（没有屋顶，直接衬着夜空；中间让开树冠） ----------
  for (const z of L.stringZ) {
    const n = 30;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const y = H - 0.15 - 1.1 * 4 * t * (1 - t);
      kit.glowBall(-hw + 0.3 + t * (L.w - 0.6), y, z + Math.sin(t * 9 + z) * 0.08, 0.045, i % 3 ? C.warm : 0xfff0d0, 3);
    }
  }
  w.pointLight(0, 4.3, -3.4, 30, 22);
  // 两侧墙和正面墙前的灯
  for (const s of [-1, 1]) {
    w.pointLight(s * 8, 3.4, zc, 34, 22);
    w.pointLight(s * 6.4, 3.4, ZONES.hallBack + 3.5, 24, 18);
  }
  const wallTitle = textMesh(STR.wallTitle, { height: 0.4, color: '#6b4a2e' });
  wallTitle.position.set(-hw + T / 2 + 0.02, 4.7, zc);
  wallTitle.rotation.y = Math.PI / 2;
  scene.add(wallTitle);

  // ---------- 纪念树和两侧的沙发 ----------
  w.tree = buildTree(w);
  for (const s of [-1, 1]) {
    kit.box(s * (L.sofaX - 0.5), 0.055, zc, 2.6, 0.03, 3.8, 0x6f5560);
    kit.box(s * (L.sofaX - 0.5), 0.062, zc, 2.2, 0.03, 3.4, 0x86697a);
    const before = w.seats.length;
    sofa(w, s * L.sofaX, zc, -s * Math.PI / 2, 2.6, 0x7f93a8, 0x9db0c4);
    const seats = w.seats.slice(before);
    w.proxy(s * L.sofaX, 0.5, zc, 1.0, 1.0, 2.9, STR.tipBench, () => w.hooks.sit(seats));
  }

  // ---------- 后墙正中合上的石门（后面的展区还没有开放） ----------
  const bz = ZONES.hallBack;
  const dh = L.backDoorHalf;
  const ds = L.backDoorSpring;
  const shape = new THREE.Shape();
  shape.moveTo(-dh, 0);
  shape.lineTo(-dh, ds);
  shape.absarc(0, ds, dh, Math.PI, 0, true);
  shape.lineTo(dh, 0);
  shape.closePath();
  const leafGeo = new THREE.ExtrudeGeometry(shape, { depth: T - 0.16, bevelEnabled: false, curveSegments: 20 });
  leafGeo.translate(0, 0, -(T - 0.16) / 2);
  const leaves = new THREE.Mesh(leafGeo, new THREE.MeshStandardMaterial({ color: 0x8f8a82, roughness: 0.9 }));
  leaves.position.z = bz;
  leaves.castShadow = leaves.receiveShadow = true;
  scene.add(leaves);
  w.collide(0, bz, dh * 2, T, true);
  for (const face of [-1, 1]) {
    const fz = bz + face * (T / 2 - 0.08);
    // 两扇门之间的门缝，和每扇门上的一圈凹线、一个石把手
    kit.box(0, (ds + dh) / 2, fz, 0.035, ds + dh, 0.02, 0x4a4641);
    for (const s of [-1, 1]) {
      const px = s * dh * 0.5;
      kit.box(px, 0.34, fz, dh * 0.62, 0.025, 0.02, 0x7a756e);
      kit.box(px, ds, fz, dh * 0.62, 0.025, 0.02, 0x7a756e);
      for (const e of [-1, 1]) kit.box(px + e * dh * 0.31, (0.34 + ds) / 2, fz, 0.025, ds - 0.34, 0.02, 0x7a756e);
      kit.box(s * 0.2, 1.15, fz + face * 0.03, 0.06, 0.34, 0.06, 0x6b665f);
    }
  }
  // 门框
  for (const s of [-1, 1]) kit.box(s * (dh + 0.11), ds / 2, bz + T / 2 + 0.05, 0.2, ds, 0.12, C.stone);

  // ---------- 接待台（大门东侧，背靠门墙，弧形） ----------
  const cx = L.receptionX;
  const cz = -0.6;
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

  w.proxy(cx, 0.55, cz - rad, 5.6, 1.0, 0.7, STR.tipReception, () => w.hooks.reception());

  // 背景墙：发光的馆名
  const faceZ = -T / 2;
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
  w.pointLight(cx, 3.0, cz - 2.6, 26, 16);

  // ---------- 电梯（大门西侧，只有门；别的楼层还没有开放） ----------
  const ex = L.elevatorX;
  const metal = 0x4a4540;
  kit.box(ex, 1.3, faceZ - 0.05, 2.5, 2.6, 0.1, metal);
  for (const s of [-1, 1]) kit.box(ex + s * 0.5, 1.14, faceZ - 0.11, 0.98, 2.2, 0.03, 0xa39a8c);
  kit.box(ex, 1.14, faceZ - 0.125, 0.02, 2.2, 0.01, 0x2b2824);
  kit.glowBox(ex, 2.28, faceZ - 0.11, 2.0, 0.02, 0.02, C.warm, 1.6);
  // 门楣上的楼层数字
  kit.box(ex, 2.95, faceZ - 0.04, 0.62, 0.44, 0.06, 0x2b2824);
  const floorNo = textMesh(STR.floorNumber, { height: 0.3, color: '#ffd9a0', glow: 2.0 });
  floorNo.position.set(ex, 2.95, faceZ - 0.08);
  floorNo.rotation.y = Math.PI;
  scene.add(floorNo);
  // 门边的呼叫面板
  kit.box(ex - 1.5, 1.2, faceZ - 0.03, 0.14, 0.3, 0.04, 0x2b2824);
  kit.glowBall(ex - 1.5, 1.2, faceZ - 0.06, 0.022, C.warm, 1.6);
  w.collide(ex, faceZ - 0.08, 2.5, 0.16);

  buildFloorMap(w);

  for (const s of [-1, 1]) plant(w, s * 2.85, -0.95, 1.15);
}
