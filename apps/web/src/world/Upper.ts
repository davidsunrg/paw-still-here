import * as THREE from 'three';
import { CONFIG, ZONES } from '../config';
import { STR } from '../i18n';
import { buildFrameShell, buildWing, createGalleryContent, hallCells, hallSlabs, wingCells, type Gallery } from './Gallery';
import { buildFloorMap } from './FloorMap';
import { buildDoorPlants, buildElevator, buildHallSofas, buildReception, buildStringLights } from './hallDressing';
import { archWall, wallStrip } from './parts';
import { buildTree } from './Tree';
import { plankTexture, textMesh } from './textures';
import type { World } from './World';

/**
 * 二层及以上：和一层同一个大厅的样子，但建在主场景之外很远的地方，是一处独立的空间。
 * 没有大门（前面是一整面墙），右墙也没有影厅和河的门洞；接待台、纪念树、沙发、电梯和总览图都还在。
 */
export const UPPER = { x: 0, z: -320 };

/** 小人在楼上能走动的范围（大厅 + 后展区） */
export const UPPER_ROOM = {
  minX: UPPER.x - CONFIG.hall.w / 2 + CONFIG.wallT / 2,
  maxX: UPPER.x + CONFIG.hall.w / 2 - CONFIG.wallT / 2,
  minZ: UPPER.z + CONFIG.gallery.wing.backZ + CONFIG.wallT / 2,
  maxZ: UPPER.z - CONFIG.wallT / 2,
};

/** 从一层上来时站在哪：大门里侧，面向纪念树 */
export const UPPER_SPAWN = { x: UPPER.x, z: UPPER.z - 3.2, yaw: 0 };

export function buildUpper(w: World): Gallery {
  const { kit, scene } = w;
  const C = CONFIG.colors;
  const H = CONFIG.wallH;
  const T = CONFIG.wallT;
  const hw = CONFIG.hall.w / 2;
  const d = CONFIG.hall.d;
  const zc = UPPER.z - d / 2;
  const L = CONFIG.hall;
  const origin = { x: UPPER.x, z: UPPER.z };

  // ---------- 地面 ----------
  const planks = plankTexture();
  planks.repeat.set(CONFIG.hall.w / 2.4, d / 2.4);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(CONFIG.hall.w, d).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ map: planks, roughness: 0.55, color: 0xe6d2bb }),
  );
  floor.position.set(UPPER.x, 0.04, zc);
  floor.receiveShadow = true;
  scene.add(floor);

  // ---------- 墙：前面一整面（没有大门），左右两面，后面留着通往后展区的石门 ----------
  kit.box(UPPER.x, H / 2, UPPER.z, CONFIG.hall.w + T, H, T, C.wall);
  w.collide(UPPER.x, UPPER.z, CONFIG.hall.w + T, T, true);
  archWall(w, UPPER.z + ZONES.hallBack, CONFIG.hall.w + T, L.backDoorHalf, L.backDoorSpring);
  for (const s of [-1, 1]) {
    kit.box(UPPER.x + s * hw, H / 2, zc, T, H, d + T, C.wall);
    w.collide(UPPER.x + s * hw, zc, T, d + T, true);
    wallStrip(kit, UPPER.x + s * hw, zc, 0, d + T);
    for (const z of [UPPER.z, UPPER.z + ZONES.hallBack]) {
      kit.box(UPPER.x + s * hw, (H + 0.3) / 2, z, 0.75, H + 0.3, 0.75, 0xc8bca9);
      kit.glowBall(UPPER.x + s * hw, H + 0.52, z, 0.2, C.warm, 2.4);
    }
  }
  wallStrip(kit, UPPER.x, UPPER.z, CONFIG.hall.w, 0);
  wallStrip(kit, UPPER.x, UPPER.z + ZONES.hallBack, CONFIG.hall.w, 0);

  // ---------- 头顶的串灯、左墙和前次一样的字 ----------
  buildStringLights(w, origin);
  const wallTitle = textMesh(STR.wallTitle, { height: 0.4, color: '#6b4a2e' });
  wallTitle.position.set(UPPER.x - hw + T / 2 + 0.02, 4.7, zc);
  wallTitle.rotation.y = Math.PI / 2;
  scene.add(wallTitle);
  const stay = textMesh(STR.wallTitleRight, { height: 0.4, color: '#6b4a2e', maxWidth: 4.6 });
  stay.position.set(UPPER.x + hw - T / 2 - 0.02, 2.55, zc);
  stay.rotation.y = -Math.PI / 2;
  scene.add(stay);

  // ---------- 纪念树和两侧的沙发（楼上的沙发只给自己的小人坐） ----------
  w.addTree(buildTree(w, origin));
  buildHallSofas(w, origin, 'upper');

  // ---------- 后墙正中通往后展区的石门 ----------
  const bz = UPPER.z + ZONES.hallBack;
  const dh = L.backDoorHalf;
  const ds = L.backDoorSpring;
  kit.box(UPPER.x, 0.03, bz, dh * 2, 0.06, T + 0.12, C.stone);
  for (const s of [-1, 1]) kit.box(UPPER.x + s * (dh + 0.11), ds / 2, bz + T / 2 + 0.05, 0.2, ds, 0.12, C.stone);
  kit.glowBox(UPPER.x, 3.72, bz + T / 2 + 0.03, dh * 2 + 0.2, 0.025, 0.025, C.warm, 1.8);
  w.pointLight(UPPER.x, 3.4, bz - 1.5, 30, 16);

  // ---------- 接待台、电梯、总览图 ----------
  buildReception(w, origin);
  buildElevator(w, origin);
  w.upperMap = buildFloorMap(w, origin, 'upper');
  buildDoorPlants(w, origin);

  // ---------- 照片墙：和一层一样的 A–H 布局，只是建在这里 ----------
  buildWing(w, origin);
  const cells = [...hallCells(origin), ...wingCells(origin)];
  return createGalleryContent(w, buildFrameShell(w, cells, hallSlabs(origin)));
}
