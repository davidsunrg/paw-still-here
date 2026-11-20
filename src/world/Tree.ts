import * as THREE from 'three';
import { CONFIG } from '../config';
import { mulberry32, PETS } from '../data/pets';
import { STR } from '../i18n';
import { Instancer } from './Kit';
import { textMesh } from './textures';
import type { World } from './World';

/** 纪念树所在位置：大厅正中，正对大门和后墙的石门 */
export const TREE_POS = new THREE.Vector3(0, 0, -CONFIG.hall.d / 2);
/** 树底座占的范围（正方形的边长），小人和访客都要绕开 */
export const TREE_SPAN = 4.7;

export interface Tree {
  /** 这位访客自己写过 n 封信：树上亮着几块自己的木牌（最多 CONFIG.tree.plaques.own 块） */
  setOwn(n: number): void;
}

/**
 * 纪念树：石砌的圆形底座、白色的树干、发光的树冠和树冠下面挂着的木牌。
 * 每块木牌是一封信；朝大门的一侧立着一个小木架，上面摊着一本本子，在这里写信。
 */
export function buildTree(w: World): Tree {
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
  // 树冠下面挂着的木牌：一根细绳，下面一块小木牌，木牌底下坠一颗小木珠。牌子上不写字，只是一个意象
  const P = CONFIG.tree.plaques;
  const woods = [C.wood, C.woodLight, 0x9a7650];
  for (let k = 0; k < P.count; k++) {
    const a = R(0, Math.PI * 2);
    const r = R(P.ring[0], P.ring[1]);
    const top = R(3.7, 4.3);
    const y = R(P.y[0], P.y[1]);
    const x = tx + Math.cos(a) * r;
    const z = tz + Math.sin(a) * r;
    const ry = R(0, Math.PI);
    kit.box(x, (top + y) / 2 + P.h / 4, z, 0.012, top - y - P.h / 2, 0.012, 0x3a2c22);
    kit.box(x, y, z, P.w, P.h, P.t, woods[k % woods.length], ry);
    kit.ball(x, y - P.h / 2 - 0.035, z, 0.022, C.woodDark);
  }
  // 访客自己的木牌：挂在朝大门的一侧、低一点的地方，颜色浅，底下坠一颗亮着的小珠。先都做好藏着
  const ownWood = new THREE.MeshStandardMaterial({ color: 0xe6c79a, emissive: 0xff9d5a, emissiveIntensity: 0.22, roughness: 0.8 });
  const cordMat = new THREE.MeshStandardMaterial({ color: 0x3a2c22, roughness: 0.9 });
  const beadMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(C.warm).multiplyScalar(2.6) });
  const plaqueGeo = new THREE.BoxGeometry(P.w, P.h, P.t);
  const beadGeo = new THREE.IcosahedronGeometry(0.026, 1);
  const own: THREE.Group[] = [];
  for (let k = 0; k < P.own; k++) {
    // 从正对大门的方向往两边排开
    const a = Math.PI / 2 + (k % 2 ? 1 : -1) * (0.18 + Math.floor(k / 2) * 0.26) + R(-0.05, 0.05);
    const r = R(1.9, 2.75);
    const top = R(3.7, 4.2);
    const y = R(P.y[0] - 0.15, P.y[0] + 0.35);
    const g = new THREE.Group();
    g.position.set(tx + Math.cos(a) * r, y, tz + Math.sin(a) * r);
    g.rotation.y = R(-0.5, 0.5);
    const cord = new THREE.Mesh(new THREE.BoxGeometry(0.012, top - y - P.h / 2, 0.012), cordMat);
    cord.position.y = (top - y) / 2 + P.h / 4;
    const bead = new THREE.Mesh(beadGeo, beadMat);
    bead.position.y = -P.h / 2 - 0.04;
    g.add(cord, new THREE.Mesh(plaqueGeo, ownWood), bead);
    g.visible = false;
    scene.add(g);
    own.push(g);
  }

  // 树前写信的小木架：两条腿，上面一块朝着来人倾斜的板，板上摊着一本本子
  const D = CONFIG.tree.desk;
  const dz = tz + D.z;
  for (const s of [-1, 1]) kit.box(tx + s * (D.w / 2 - 0.06), D.h / 2 - 0.04, dz, 0.06, D.h - 0.08, 0.3, C.woodDark);
  kit.box(tx, 0.34, dz, D.w - 0.12, 0.05, 0.05, C.woodDark);
  const desk = new THREE.Group();
  desk.position.set(tx, D.h, dz);
  desk.rotation.x = D.tilt;
  const part = (sx: number, sy: number, sz: number, x: number, y: number, z: number, color: number, ry = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), new THREE.MeshStandardMaterial({ color, roughness: 0.85 }));
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.castShadow = true;
    desk.add(m);
  };
  part(D.w, 0.04, D.d, 0, 0, 0, C.wood);
  part(D.w, 0.05, 0.03, 0, 0.03, D.d / 2 - 0.015, C.woodLight);
  part(0.6, 0.02, 0.37, 0, 0.03, -0.02, 0x7b3f3f);
  part(0.27, 0.03, 0.34, -0.14, 0.045, -0.02, 0xfaf4e6, 0.04);
  part(0.27, 0.03, 0.34, 0.14, 0.045, -0.02, 0xf3ecdb, -0.04);
  scene.add(desk);
  w.collide(tx, dz, D.w, D.d);
  w.proxy(tx, D.h + 0.1, dz, D.w, 0.5, D.d + 0.1, STR.tipGuestbook, () => w.hooks.guestbook());
  // 点树干或者木牌那一圈：读树上的信
  w.proxy(tx, 2.2, tz, 1.4, 3.4, 1.4, STR.tipTree, () => w.hooks.tree());

  kit.pool(tx, tz, 16, C.warm, 0.2);
  w.pointLight(tx + 3.1, 2.3, tz + 3.1, 15, 20, 0xffcf9a);
  w.pointLight(tx - 3.1, 2.3, tz - 3.1, 15, 20, 0xffcf9a);

  // 树名朝着大门
  const label = textMesh(STR.treeLabel, { height: 0.22, color: '#ffd9a0', glow: 1.6, maxWidth: 2.2 });
  label.position.set(tx, 0.24, tz + 2.53);
  scene.add(label);

  return {
    setOwn(n) {
      own.forEach((g, i) => (g.visible = i < n));
    },
  };
}
