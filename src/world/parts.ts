import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Kit } from './Kit';
import type { World } from './World';

/** 把局部坐标 (lx, lz) 按 rotY 旋转后放到 (cx, cz) */
export function placer(cx: number, cz: number, rot: number) {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return (lx: number, lz: number): [number, number] => [cx + lx * c + lz * s, cz - lx * s + lz * c];
}

/** 旋转后的包围盒尺寸（只处理 90° 的倍数，其余按最大边处理） */
function rotatedSize(sx: number, sz: number, rot: number): [number, number] {
  const q = Math.abs(Math.round(rot / (Math.PI / 2))) % 2;
  return q === 1 ? [sz, sx] : [sx, sz];
}

/** 带拱门的墙，墙体中心在 z 处 */
export function archWall(
  w: World, z: number, width: number, doorHalf: number, spring: number, trim = false,
) {
  const H = CONFIG.wallH;
  const T = CONFIG.wallT;
  const s = new THREE.Shape();
  s.moveTo(-width / 2, 0);
  s.lineTo(-doorHalf, 0);
  s.lineTo(-doorHalf, spring);
  s.absarc(0, spring, doorHalf, Math.PI, 0, true);
  s.lineTo(doorHalf, 0);
  s.lineTo(width / 2, 0);
  s.lineTo(width / 2, H);
  s.lineTo(-width / 2, H);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: T, bevelEnabled: false, curveSegments: 20 });
  geo.translate(0, 0, -T / 2);
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: CONFIG.colors.wall, roughness: 0.85 }));
  mesh.position.z = z;
  mesh.castShadow = mesh.receiveShadow = true;
  w.scene.add(mesh);

  const side = (width / 2 - doorHalf);
  w.collide(-doorHalf - side / 2, z, side, T, true);
  w.collide(doorHalf + side / 2, z, side, T, true);

  if (trim) {
    // 拱门外沿的一圈暖光
    const arc = new THREE.Mesh(
      new THREE.TorusGeometry(doorHalf + 0.06, 0.035, 8, 40, Math.PI),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(CONFIG.colors.warm).multiplyScalar(2.4) }),
    );
    arc.position.set(0, spring, z + T / 2 + 0.03);
    w.scene.add(arc);
    for (const sx of [-1, 1]) {
      w.kit.glowBox(sx * (doorHalf + 0.06), spring / 2, z + T / 2 + 0.03, 0.06, spring, 0.06, CONFIG.colors.warm, 2.4);
    }
  }
}

/** 墙顶的暖色灯带 */
export function wallStrip(kit: Kit, x: number, z: number, lenX: number, lenZ: number) {
  kit.glowBox(x, CONFIG.wallH + 0.04, z, Math.max(lenX, 0.07), 0.07, Math.max(lenZ, 0.07), CONFIG.colors.warm, 2.2);
}

/** 在沙发 / 长椅上登记左右两个座位（局部 +Z 是正面） */
function seats(w: World, P: ReturnType<typeof placer>, rot: number, lx: number, lz: number, top: number) {
  for (const side of [-1, 1]) {
    const [x, z] = P(side * lx, lz);
    w.seat('hall', x, z, top, Math.sin(rot), Math.cos(rot));
  }
}

/** 沙发：局部 +Z 方向是正面 */
export function sofa(w: World, cx: number, cz: number, rot: number, width: number, color: number, cushion: number) {
  const { kit } = w;
  const P = placer(cx, cz, rot);
  seats(w, P, rot, width / 4, 0.12, 0.5);
  const b = (lx: number, y: number, lz: number, sx: number, sy: number, sz: number, c: number) => {
    const [x, z] = P(lx, lz);
    kit.box(x, y, z, sx, sy, sz, c, rot);
  };
  b(0, 0.2, 0, width, 0.3, 0.92, color);
  b(0, 0.62, -0.36, width, 0.74, 0.2, color);
  for (const sx of [-1, 1]) b(sx * (width / 2 + 0.1), 0.38, 0, 0.2, 0.66, 0.92, color);
  const n = width > 2.1 ? 3 : 2;
  for (let i = 0; i < n; i++) {
    const cw = width / n;
    b(-width / 2 + cw * (i + 0.5), 0.42, 0.07, cw - 0.05, 0.16, 0.74, cushion);
    b(-width / 2 + cw * (i + 0.5), 0.72, -0.22, cw - 0.08, 0.44, 0.14, cushion);
  }
  const [sx, sz] = rotatedSize(width + 0.4, 0.95, rot);
  w.collide(cx, cz, sx, sz);
}

/** 长椅；seated 为 false 时不登记座位（模拟访客不会来坐） */
export function bench(w: World, cx: number, cz: number, rot: number, width = 1.8, seated = true) {
  const { kit } = w;
  const P = placer(cx, cz, rot);
  if (seated) seats(w, P, rot, width / 4, 0.02, 0.485);
  const wood = CONFIG.colors.woodLight;
  const dark = 0x33333b;
  const b = (lx: number, y: number, lz: number, sx: number, sy: number, sz: number, c: number) => {
    const [x, z] = P(lx, lz);
    kit.box(x, y, z, sx, sy, sz, c, rot);
  };
  b(0, 0.45, 0, width, 0.07, 0.5, wood);
  b(0, 0.82, -0.22, width, 0.3, 0.06, wood);
  for (const sx of [-1, 1]) {
    b(sx * (width / 2 - 0.12), 0.21, 0, 0.07, 0.42, 0.46, dark);
    b(sx * (width / 2 - 0.12), 0.68, -0.22, 0.06, 0.5, 0.06, dark);
  }
  const [sx, sz] = rotatedSize(width, 0.55, rot);
  w.collide(cx, cz, sx, sz);
}

/** 盆栽 */
export function plant(w: World, x: number, z: number, s = 1) {
  const { kit } = w;
  kit.cyl(x, 0, z, 0.26 * s, 0.42 * s, 0xb9714f);
  kit.cyl(x, 0.42 * s, z, 0.29 * s, 0.05 * s, 0xa5613f);
  kit.ball(x, 0.95 * s, z, 0.48 * s, 0x3f8256, 1.15, 1.2);
  kit.ball(x + 0.2 * s, 1.35 * s, z + 0.08 * s, 0.34 * s, 0x4c9563, 1.1, 2.6);
  kit.ball(x - 0.18 * s, 1.25 * s, z - 0.12 * s, 0.3 * s, 0x357049, 1.1, 0.4);
  w.collide(x, z, 0.6 * s, 0.6 * s);
}

/** 壁灯：dir 是灯朝向房间内的方向 (±1)，axis 表示墙沿哪条轴 */
export function sconce(w: World, x: number, y: number, z: number, nx: number, nz: number) {
  const { kit } = w;
  kit.box(x + nx * 0.05, y - 0.12, z + nz * 0.05, nx ? 0.1 : 0.14, 0.06, nz ? 0.1 : 0.14, 0x2b2b33);
  kit.glowBall(x + nx * 0.14, y, z + nz * 0.14, 0.1, CONFIG.colors.warm, 2.6);
  kit.pool(x + nx * 0.9, z + nz * 0.9, 4.2, CONFIG.colors.warm, 0.22);
}
