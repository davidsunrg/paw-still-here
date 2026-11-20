import * as THREE from 'three';
import { CONFIG, ZONES } from '../config';
import { mulberry32, PETS } from '../data/pets';
import { STR } from '../strings';
import { archWall, plant, sofa, wallStrip } from './parts';
import { pawTexture, plankTexture, textMesh } from './textures';
import type { World } from './World';

export function buildHall(w: World) {
  const { kit, scene } = w;
  const C = CONFIG.colors;
  const H = CONFIG.wallH;
  const T = CONFIG.wallT;
  const hw = CONFIG.hall.w / 2;
  const d = CONFIG.hall.d;
  const zc = -d / 2;
  const rnd = mulberry32(11);
  const R = (a: number, b: number) => a + rnd() * (b - a);

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

  const emblem = new THREE.Mesh(
    new THREE.PlaneGeometry(3.2, 3.2).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: pawTexture(), transparent: true, opacity: 0.16, depthWrite: false, color: 0xffe2b0 }),
  );
  emblem.position.set(0, 0.05, zc);
  scene.add(emblem);

  // ---------- 墙 ----------
  archWall(w, ZONES.hallFront, CONFIG.hall.w + T, CONFIG.hall.doorHalf, CONFIG.hall.doorSpring, true);
  archWall(w, ZONES.hallBack, CONFIG.hall.w + T, CONFIG.corridor.doorHalf, CONFIG.corridor.doorSpring);
  for (const sx of [-1, 1]) {
    kit.box(sx * hw, H / 2, zc, T, H, d + T, C.wall);
    w.collide(sx * hw, zc, T, d + T, true);
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
  const doorName = textMesh(STR.brand, { height: 0.42, color: '#ffd9a0', glow: 1.9 });
  doorName.position.set(0, 4.72, T / 2 + 0.02);
  scene.add(doorName);

  // ---------- 头顶的串灯（没有屋顶，直接衬着夜空） ----------
  for (const z of [-2.5, -6.5, -11.5, -15.5]) {
    const n = 30;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const y = H - 0.15 - 1.1 * 4 * t * (1 - t);
      kit.glowBall(-hw + 0.3 + t * (CONFIG.hall.w - 0.6), y, z + Math.sin(t * 9 + z) * 0.08, 0.045, i % 3 ? C.warm : 0xfff0d0, 3);
    }
  }
  w.pointLight(-3, 4.3, zc, 46, 26);
  w.pointLight(5, 4.3, zc + 3, 38, 24);

  // ---------- 照片墙（左墙） ----------
  const wallX = -hw + T / 2;
  const cols = 8;
  const rows = 3;
  const featured = PETS.slice(0, Math.min(CONFIG.wallPhotos, cols * rows));
  const frameColors = [0x3b2a20, 0xd9c7a0, 0xf2efe8, 0xb08d57, 0x5a4636];
  featured.forEach((pet, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    const s = R(0.7, 0.94);
    const z = -2.3 - c * ((d - 4.6) / (cols - 1)) + R(-0.12, 0.12);
    const y = 1.3 + r * 1.2 + R(-0.04, 0.04);
    kit.box(wallX + 0.03, y, z, 0.06, s + 0.16, s + 0.16, frameColors[i % frameColors.length]);
    w.photos.add(pet, new THREE.Vector3(wallX + 0.07, y, z), Math.PI / 2, s, s, 'wall');
    kit.glowBox(wallX + 0.12, y + s / 2 + 0.17, z, 0.05, 0.035, s * 0.5, C.warm, 2.6);
  });
  const wallTitle = textMesh(STR.wallTitle, { height: 0.4, color: '#6b4a2e' });
  wallTitle.position.set(wallX + 0.02, 4.7, zc);
  wallTitle.rotation.y = Math.PI / 2;
  scene.add(wallTitle);
  w.pointLight(-7.6, 3.0, zc, 24, 18);

  // ---------- 休息区（右前方） ----------
  const sx = 7.2;
  const sz = -4.6;
  kit.box(sx, 0.055, sz, 6.4, 0.03, 5.0, 0x6f5560);
  kit.box(sx, 0.062, sz, 5.8, 0.03, 4.4, 0x86697a);
  sofa(w, sx, -1.35, Math.PI, 2.6, 0x7f93a8, 0x9db0c4);
  sofa(w, sx + 3.2, sz - 0.4, -Math.PI / 2, 2.0, 0x7f93a8, 0x9db0c4);
  sofa(w, sx - 3.2, sz - 0.4, Math.PI / 2, 2.0, 0x7f93a8, 0x9db0c4);
  // 茶几
  kit.box(sx, 0.42, sz - 0.3, 1.5, 0.06, 0.85, C.woodLight);
  for (const [lx, lz] of [[-0.65, -0.33], [0.65, -0.33], [-0.65, 0.33], [0.65, 0.33]]) {
    kit.box(sx + lx, 0.2, sz - 0.3 + lz, 0.06, 0.4, 0.06, C.woodDark);
  }
  w.collide(sx, sz - 0.3, 1.5, 0.85);
  kit.box(sx - 0.35, 0.5, sz - 0.3, 0.26, 0.1, 0.14, 0xf4f1ea);
  kit.box(sx - 0.35, 0.56, sz - 0.3, 0.1, 0.03, 0.04, 0xffffff);
  kit.cyl(sx + 0.3, 0.45, sz - 0.25, 0.035, 0.1, 0xf6ecd8);
  kit.flame(sx + 0.3, 0.58, sz - 0.25, 0.02);
  // 落地灯
  const lx = sx + 3.5;
  const lz = -1.3;
  kit.cyl(lx, 0, lz, 0.18, 0.04, 0x2b2b33);
  kit.cyl(lx, 0, lz, 0.025, 1.55, 0x2b2b33);
  kit.glowCyl(lx, 1.5, lz, 0.2, 0.34, 0xffd9a0, 2.2);
  kit.pool(lx - 0.5, lz - 0.5, 6, C.warm, 0.3);
  w.pointLight(lx - 1.3, 1.9, lz - 1.5, 9, 10);
  plant(w, sx - 3.4, -1.1, 1.15);

  // ---------- 接待台（右后方，弧形） ----------
  const cx = hw - 0.6;
  const cz = -12.6;
  const rad = 2.7;
  const seg = 7;
  const a0 = THREE.MathUtils.degToRad(112);
  const a1 = THREE.MathUtils.degToRad(248);
  for (let i = 0; i < seg; i++) {
    const a = a0 + ((i + 0.5) / seg) * (a1 - a0);
    const x = cx + Math.cos(a) * rad;
    const z = cz + Math.sin(a) * rad;
    const ry = Math.atan2(-Math.cos(a), -Math.sin(a));
    kit.box(x, 0.52, z, 1.0, 1.04, 0.42, C.wood, ry);
    kit.box(x + Math.cos(a) * 0.03, 1.07, z + Math.sin(a) * 0.03, 1.06, 0.06, 0.62, C.woodLight, ry);
    kit.glowBox(x + Math.cos(a) * 0.23, 0.14, z + Math.sin(a) * 0.23, 0.96, 0.03, 0.03, C.warm, 2.2, ry);
    w.collide(x, z, 0.9, 0.9);
  }
  const deskAt = (deg: number, off = 0): [number, number] => {
    const a = THREE.MathUtils.degToRad(deg);
    return [cx + Math.cos(a) * (rad + off), cz + Math.sin(a) * (rad + off)];
  };
  // 台面上的爪印标志
  const logo = new THREE.Mesh(
    new THREE.PlaneGeometry(0.62, 0.62),
    new THREE.MeshBasicMaterial({ map: pawTexture(), transparent: true, depthWrite: false, color: new THREE.Color(C.warm).multiplyScalar(1.8) }),
  );
  const [gx, gz] = deskAt(180, 0.22);
  logo.position.set(gx, 0.62, gz);
  logo.rotation.y = -Math.PI / 2;
  scene.add(logo);
  // 留言簿
  const [bx, bz] = deskAt(180, 0.02);
  kit.box(bx, 1.115, bz - 0.14, 0.34, 0.03, 0.27, 0xfaf4e6, 0.06);
  kit.box(bx, 1.115, bz + 0.14, 0.34, 0.03, 0.27, 0xf3ecdb, -0.06);
  kit.box(bx, 1.105, bz, 0.37, 0.02, 0.6, 0x7b3f3f);
  kit.cyl(bx + 0.05, 1.13, bz + 0.42, 0.012, 0.16, 0x2b2b33);
  w.proxy(bx, 1.16, bz, 0.5, 0.2, 0.75, STR.tipGuestbook, () => w.hooks.guestbook());
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
  kit.ball(mx - 0.02, 1.4, mz, 0.095, 0xfaf6ee);
  kit.cone(mx - 0.02, 1.46, mz - 0.055, 0.035, 0.07, 0xfaf6ee);
  kit.cone(mx - 0.02, 1.46, mz + 0.055, 0.035, 0.07, 0xfaf6ee);
  kit.ball(mx - 0.11, 1.4, mz - 0.035, 0.014, 0x2a2320);
  kit.ball(mx - 0.11, 1.4, mz + 0.035, 0.014, 0x2a2320);
  kit.ball(mx - 0.07, 1.3, mz, 0.03, 0xe0504a);

  w.proxy(cx - rad, 0.55, cz, 0.7, 1.0, 5.6, STR.tipReception, () => w.hooks.reception());

  // 背景墙：发光的馆名
  const backX = hw - T / 2 - 0.07;
  const name = textMesh(STR.brand, { height: 0.62, color: '#ffd9a0', glow: 2.0 });
  name.position.set(backX, 3.35, cz);
  name.rotation.y = -Math.PI / 2;
  const sub = textMesh(STR.subtitle, { height: 0.24, color: '#fff1dc', glow: 1.25 });
  sub.position.set(backX, 2.72, cz);
  sub.rotation.y = -Math.PI / 2;
  scene.add(name, sub);
  kit.box(hw - T / 2 - 0.03, 3.1, cz, 0.05, 1.7, 6.2, 0x5a4636);
  // 背景墙下的矮柜
  kit.box(hw - T / 2 - 0.3, 0.45, cz, 0.5, 0.9, 3.4, C.woodDark);
  kit.box(hw - T / 2 - 0.3, 0.92, cz, 0.56, 0.05, 3.5, C.woodLight);
  for (const dz of [-1.2, 0, 1.2]) {
    kit.cyl(hw - T / 2 - 0.3, 0.95, cz + dz, 0.045, 0.14, 0xf6ecd8);
    kit.flame(hw - T / 2 - 0.3, 1.13, cz + dz, 0.024);
  }
  w.collide(hw - T / 2 - 0.3, cz, 0.6, 3.5);
  w.pointLight(cx - 2.6, 3.0, cz, 26, 16);
  plant(w, hw - 1.0, -16.9, 1.25);
  plant(w, hw - 1.0, -8.6, 1.1);

  // ---------- 通往纪念区的指示 ----------
  const sign = textMesh(STR.hallSign, { height: 0.36, color: '#ffd9a0', glow: 2.0 });
  sign.position.set(0, 4.42, ZONES.hallBack + T / 2 + 0.02);
  scene.add(sign);
  for (const s of [-1, 1]) {
    kit.glowBall(s * 2.6, 2.5, ZONES.hallBack + T / 2 + 0.14, 0.13, C.warm, 2.6);
    plant(w, s * 3.3, ZONES.hallBack + 0.95, 1.2);
  }
}
