import * as THREE from 'three';
import { CONFIG } from '../config';
import { mulberry32, PETS } from '../data/pets';
import { STR } from '../strings';
import { Instancer } from './Kit';
import { textMesh } from './textures';
import type { World } from './World';

/** 纪念树所在位置：大厅正中，正对大门和后墙的石门 */
export const TREE_POS = new THREE.Vector3(0, 0, -CONFIG.hall.d / 2);
/** 树底座占的范围（正方形的边长），小人和访客都要绕开 */
export const TREE_SPAN = 4.7;

/** 纪念树：石砌的圆形底座、白色的树干、发光的树冠和垂下来的灯串 */
export function buildTree(w: World) {
  const { kit, scene } = w;
  const C = CONFIG.colors;
  const rnd = mulberry32(23);
  const R = (a: number, b: number) => a + rnd() * (b - a);
  // 这棵树原本在纪念区，搭它之前每只宠物用掉过一次随机数；保留这些取值，树的样子才和原来一样
  for (let i = 0; i < PETS.length; i++) R(0, 1);

  const { x: tx, z: tz } = TREE_POS;
  kit.cyl(tx, 0, tz, 2.5, 0.42, 0xa9a39a);
  kit.cyl(tx, 0.42, tz, 2.62, 0.07, 0xc4beb4);
  kit.cyl(tx, 0.42, tz, 2.2, 0.1, 0x4a3a2e);
  w.collide(tx, tz, TREE_SPAN, TREE_SPAN);
  kit.cyl(tx, 0.4, tz, 0.42, 1.6, 0xe9e1d6);
  kit.cyl(tx, 2.0, tz, 0.32, 1.5, 0xe9e1d6);
  kit.cyl(tx, 3.5, tz, 0.22, 1.2, 0xe9e1d6);

  const canopy = new Instancer(
    new THREE.IcosahedronGeometry(1, 1),
    new THREE.MeshStandardMaterial({
      color: 0xffe6cf,
      emissive: 0xff9d6b,
      emissiveIntensity: 0.16,
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
  kit.pool(tx, tz, 16, C.warm, 0.2);
  w.pointLight(tx + 3.1, 2.3, tz + 3.1, 15, 20, 0xffcf9a);
  w.pointLight(tx - 3.1, 2.3, tz - 3.1, 15, 20, 0xffcf9a);

  // 树名朝着大门
  const label = textMesh(STR.treeLabel, { height: 0.22, color: '#ffd9a0', glow: 1.6 });
  label.position.set(tx, 0.24, tz + 2.53);
  scene.add(label);
}
