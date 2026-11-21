import * as THREE from 'three';
import { CONFIG } from '../config';
import { mulberry32, PETS } from '../data/pets';
import { STR } from '../i18n';
import { Instancer } from './Kit';
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
 * 每块木牌是一封信，点树可以读。
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
  // 树冠下面挂着的木牌：一根细绳，下面一块小木牌，木牌底下坠一颗小木珠。牌子上不写字，只是一个意象。
  // 每块都绕着绳子顶上的挂点轻轻摆，节奏各不相同
  const P = CONFIG.tree.plaques;
  const S = P.sway;
  const woods = [C.wood, C.woodLight, 0x9a7650];
  interface Hang { x: number; top: number; z: number; len: number; ry: number; ph: number; sp: number; amp: number }
  const hang = (x: number, top: number, z: number, y: number, ry: number): Hang => ({
    x, top, z, len: top - y, ry,
    ph: R(0, Math.PI * 2),
    sp: (Math.PI * 2) / R(S.period[0], S.period[1]),
    amp: S.angle * R(0.6, 1),
  });
  /** 这一刻的姿态：前后、左右各摆一点，再慢慢拧一点。两个方向的快慢不一样，看起来不会像钟摆 */
  const pose = (o: THREE.Object3D, h: Hang, t: number) => {
    o.position.set(h.x, h.top, h.z);
    o.rotation.set(
      Math.sin(t * h.sp + h.ph) * h.amp,
      h.ry + Math.sin(t * h.sp * 0.37 + h.ph * 2) * S.twist,
      Math.sin(t * h.sp * 0.83 + h.ph * 1.7) * h.amp * 0.7,
      'XZY',
    );
  };
  const hangs: Hang[] = [];
  for (let k = 0; k < P.count; k++) {
    const a = R(0, Math.PI * 2);
    const r = R(P.ring[0], P.ring[1]);
    const top = R(3.7, 4.3);
    const y = R(P.y[0], P.y[1]);
    hangs.push(hang(tx + Math.cos(a) * r, top, tz + Math.sin(a) * r, y, R(0, Math.PI)));
  }
  const unit = new THREE.BoxGeometry(1, 1, 1);
  const cordMat = new THREE.MeshStandardMaterial({ color: 0x3a2c22, roughness: 0.9 });
  const cords = new THREE.InstancedMesh(unit, cordMat, P.count);
  const boards = new THREE.InstancedMesh(unit, new THREE.MeshStandardMaterial({ roughness: 0.85 }), P.count);
  const beads = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(0.022, 1),
    new THREE.MeshStandardMaterial({ color: C.woodDark, roughness: 0.85 }),
    P.count,
  );
  const tint = new THREE.Color();
  hangs.forEach((_, k) => boards.setColorAt(k, tint.set(woods[k % woods.length])));
  scene.add(cords, boards, beads);
  const pivot = new THREE.Object3D();
  const part = new THREE.Matrix4();
  const out = new THREE.Matrix4();
  const place = (t: number) => {
    hangs.forEach((h, k) => {
      pose(pivot, h, t);
      pivot.updateMatrix();
      const cl = h.len - P.h / 2;
      cords.setMatrixAt(k, out.multiplyMatrices(pivot.matrix, part.makeScale(0.012, cl, 0.012).setPosition(0, -cl / 2, 0)));
      boards.setMatrixAt(k, out.multiplyMatrices(pivot.matrix, part.makeScale(P.w, P.h, P.t).setPosition(0, -h.len, 0)));
      beads.setMatrixAt(k, out.multiplyMatrices(pivot.matrix, part.makeTranslation(0, -h.len - P.h / 2 - 0.035, 0)));
    });
    for (const m of [cords, boards, beads]) m.instanceMatrix.needsUpdate = true;
  };
  place(0);
  for (const m of [cords, boards, beads]) m.computeBoundingSphere();

  // 访客自己的木牌：挂在朝大门的一侧、低一点的地方，颜色浅，底下坠一颗亮着的小珠。先都做好藏着
  const ownWood = new THREE.MeshStandardMaterial({ color: 0xe6c79a, emissive: 0xff9d5a, emissiveIntensity: 0.22, roughness: 0.8 });
  const beadMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(C.warm).multiplyScalar(2.6) });
  const plaqueGeo = new THREE.BoxGeometry(P.w, P.h, P.t);
  const beadGeo = new THREE.IcosahedronGeometry(0.026, 1);
  const own: Array<{ g: THREE.Group; h: Hang }> = [];
  for (let k = 0; k < P.own; k++) {
    // 从正对大门的方向往两边排开
    const a = Math.PI / 2 + (k % 2 ? 1 : -1) * (0.18 + Math.floor(k / 2) * 0.26) + R(-0.05, 0.05);
    const r = R(1.9, 2.75);
    const top = R(3.7, 4.2);
    const y = R(P.y[0] - 0.15, P.y[0] + 0.35);
    const h = hang(tx + Math.cos(a) * r, top, tz + Math.sin(a) * r, y, R(-0.5, 0.5));
    const g = new THREE.Group();
    const cl = h.len - P.h / 2;
    const cord = new THREE.Mesh(new THREE.BoxGeometry(0.012, cl, 0.012), cordMat);
    cord.position.y = -cl / 2;
    const board = new THREE.Mesh(plaqueGeo, ownWood);
    board.position.y = -h.len;
    const bead = new THREE.Mesh(beadGeo, beadMat);
    bead.position.y = -h.len - P.h / 2 - 0.04;
    g.add(cord, board, bead);
    pose(g, h, 0);
    g.visible = false;
    scene.add(g);
    own.push({ g, h });
  }
  // 离树远了看不清摆动，就不算了
  w.updaters.push((_dt, t, who) => {
    if (Math.hypot(who.x - tx, who.z - tz) > S.range) return;
    place(t);
    for (const o of own) if (o.g.visible) pose(o.g, o.h, t);
  });

  // 点树干或者木牌那一圈：读树上的信
  w.proxy(tx, 2.2, tz, 1.4, 3.4, 1.4, STR.tipTree, () => w.hooks.tree());

  kit.pool(tx, tz, 16, C.warm, 0.2);
  w.pointLight(tx + 3.1, 2.3, tz + 3.1, 15, 20, 0xffcf9a);
  w.pointLight(tx - 3.1, 2.3, tz - 3.1, 15, 20, 0xffcf9a);

  return {
    setOwn(n) {
      own.forEach((o, i) => (o.g.visible = i < n));
    },
  };
}
