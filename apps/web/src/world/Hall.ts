import * as THREE from 'three';
import { CONFIG, ZONES } from '../config';
import { STR } from '../i18n';
import { buildCaveEntrance } from './Cave';
import { buildCinemaEntrance } from './Cinema';
import { buildFloorMap } from './FloorMap';
import { buildDoorPlants, buildElevator, buildHallSofas, buildReception, buildStringLights } from './hallDressing';
import { archWall, doorWall, plant, wallStrip } from './parts';
import { buildTree } from './Tree';
import { plankTexture, textMesh } from './textures';
import type { World } from './World';

/** 一层大厅（Lobby）：正中是纪念树，左墙和正面墙是照片墙（见 Gallery.ts），门墙两侧是接待台和电梯，右墙是影厅和河的入口（见 Cinema.ts、Cave.ts）。二层及以上是另一处空间，见 Upper.ts */
export function buildHall(w: World) {
  const { kit, scene } = w;
  const C = CONFIG.colors;
  const H = CONFIG.wallH;
  const T = CONFIG.wallT;
  const hw = CONFIG.hall.w / 2;
  const d = CONFIG.hall.d;
  const zc = -d / 2;
  const L = CONFIG.hall;
  const origin = { x: 0, z: 0 };

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
  // 左墙是一整面；右墙不挂照片，开着两个门洞：靠大门一侧是河，靠后墙一侧是影厅
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

  // ---------- 头顶的串灯（没有屋顶，直接衬着夜空） ----------
  buildStringLights(w, origin);
  const wallTitle = textMesh(STR.wallTitle, { height: 0.4, color: '#6b4a2e' });
  wallTitle.position.set(-hw + T / 2 + 0.02, 4.7, zc);
  wallTitle.rotation.y = Math.PI / 2;
  scene.add(wallTitle);

  // ---------- 纪念树和两侧的沙发 ----------
  w.addTree(buildTree(w));
  buildHallSofas(w, origin, 'hall');

  // ---------- 后墙正中打开的石门：通向 C–H 展区 ----------
  const bz = ZONES.hallBack;
  const dh = L.backDoorHalf;
  const ds = L.backDoorSpring;
  // 门槛和门框；门扇已经打开，走廊和展区在后墙后面
  kit.box(0, 0.03, bz, dh * 2, 0.06, T + 0.12, C.stone);
  for (const s of [-1, 1]) kit.box(s * (dh + 0.11), ds / 2, bz + T / 2 + 0.05, 0.2, ds, 0.12, C.stone);
  kit.glowBox(0, 3.72, bz + T / 2 + 0.03, dh * 2 + 0.2, 0.025, 0.025, C.warm, 1.8);
  w.pointLight(0, 3.4, bz - 1.5, 30, 16);

  // ---------- 接待台、电梯、总览图 ----------
  buildReception(w, origin);
  buildElevator(w, origin);
  w.floorMap = buildFloorMap(w, origin, 'lobby');
  buildDoorPlants(w, origin);
}
