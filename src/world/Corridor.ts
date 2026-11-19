import * as THREE from 'three';
import { CONFIG, ZONES } from '../config';
import { STR } from '../strings';
import { sconce, wallStrip } from './parts';
import { pawTexture, textMesh, tileTexture } from './textures';
import type { World } from './World';

export function buildCorridor(w: World) {
  const { kit, scene } = w;
  const C = CONFIG.colors;
  const H = CONFIG.wallH;
  const T = CONFIG.wallT;
  const half = CONFIG.corridor.half;
  const len = CONFIG.corridor.len;
  const z0 = ZONES.hallBack;
  const zc = z0 - len / 2;

  // 地面
  const tiles = tileTexture(150, 12);
  tiles.repeat.set(1, len / 4);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(half * 2, len).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ map: tiles, roughness: 0.7 }),
  );
  floor.position.set(0, 0.04, zc);
  floor.receiveShadow = true;
  scene.add(floor);

  // 两侧的墙
  for (const sx of [-1, 1]) {
    const x = sx * (half + T / 2);
    kit.box(x, H / 2, zc, T, H, len - T, 0x8d8378);
    w.collide(x, zc, T, len, true);
    wallStrip(kit, x, zc, 0, len - T);
    for (let i = 0; i < 3; i++) {
      sconce(w, sx * half, 2.5, z0 - 2 - i * 3, -sx, 0);
    }
  }
  w.pointLight(0, 3.6, zc, 7, 14);

  // 墙上的短句，左右交替
  STR.quotes.forEach((q, i) => {
    const left = i % 2 === 0;
    const m = textMesh(q, { height: 0.2, color: '#ffe4bd', glow: 1.7, weight: '500' });
    m.position.set((left ? -1 : 1) * (half - 0.02), 1.72, z0 - 2.4 - i * 1.75);
    m.rotation.y = left ? Math.PI / 2 : -Math.PI / 2;
    scene.add(m);
  });

  // 地上的发光爪印：走近时依次亮起
  const geo = new THREE.PlaneGeometry(0.42, 0.42).rotateX(-Math.PI / 2);
  const warm = new THREE.Color(C.warm);
  const prints: Array<{ mat: THREE.MeshBasicMaterial; z: number; level: number }> = [];
  const n = 13;
  for (let i = 0; i < n; i++) {
    const mat = new THREE.MeshBasicMaterial({
      map: pawTexture(),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      color: warm.clone().multiplyScalar(0.12),
    });
    const m = new THREE.Mesh(geo, mat);
    const z = z0 - 0.9 - i * ((len - 1.8) / (n - 1));
    m.position.set(i % 2 ? 0.3 : -0.3, 0.06, z);
    m.rotation.y = i % 2 ? -0.18 : 0.18;
    scene.add(m);
    prints.push({ mat, z, level: 0.12 });
  }
  w.updaters.push((dt, _t, p) => {
    const inside = Math.abs(p.x) < half + 1;
    for (const pr of prints) {
      const target = inside && Math.abs(p.z - pr.z) < 3.4 ? 2.2 : 0.12;
      pr.level += (target - pr.level) * Math.min(1, dt * 4);
      pr.mat.color.copy(warm).multiplyScalar(pr.level);
    }
  });
}
