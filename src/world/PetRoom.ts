import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG } from '../config';
import { canvasTexture, makeCanvas } from './textures';

const S = CONFIG.shrine;
const P = S.palette;

export interface RoomContext {
  env: THREE.Texture;
  photoMaterial: THREE.MeshBasicMaterial;
  /** 主照片和搁板小相框共用 atlas；换宠物时统一改这些平面的 UV */
  photos: Array<THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>>;
}

type Vec3 = [number, number, number];
type Mat = THREE.MeshStandardMaterial | THREE.MeshBasicMaterial;

/**
 * 静态零件先按材质收集，最后一次合并。家具函数仍然各自返回独立 Group，
 * 但一件家具通常只剩几次 draw call；以后换成 GLB 时不需要改这个工具。
 */
class Parts {
  readonly group = new THREE.Group();
  private buckets = new Map<Mat, THREE.BufferGeometry[]>();

  add(geometry: THREE.BufferGeometry, material: Mat, at: Vec3 = [0, 0, 0], scale: Vec3 = [1, 1, 1], rotation: Vec3 = [0, 0, 0]) {
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(...at),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
      new THREE.Vector3(...scale),
    );
    geometry.applyMatrix4(matrix);
    const list = this.buckets.get(material) ?? [];
    list.push(geometry);
    this.buckets.set(material, list);
  }

  beam(material: Mat, from: Vec3, to: Vec3, radius: number) {
    const a = new THREE.Vector3(...from);
    const b = new THREE.Vector3(...to);
    const delta = b.clone().sub(a);
    const geometry = new THREE.CylinderGeometry(radius, radius, delta.length(), 12);
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()));
    geometry.translate(...a.add(b).multiplyScalar(0.5).toArray());
    const list = this.buckets.get(material) ?? [];
    list.push(geometry);
    this.buckets.set(material, list);
  }

  mesh(object: THREE.Object3D) {
    this.group.add(object);
  }

  finish() {
    for (const [material, list] of this.buckets) {
      const flat = list.map((g) => (g.index ? g.toNonIndexed() : g));
      const geometry = mergeGeometries(flat, false);
      if (!geometry) throw new Error('宠物小屋的静态零件合并失败');
      const mesh = new THREE.Mesh(geometry, material);
      mesh.renderOrder = material.userData.renderOrder ?? (material.transparent ? 10.2 : 0);
      this.group.add(mesh);
      for (const g of list) g.dispose();
      for (const g of flat) if (!list.includes(g)) g.dispose();
    }
    this.buckets.clear();
    return this.group;
  }
}

function surface(ctx: RoomContext, color: number, roughness = 0.86, map?: THREE.Texture) {
  return new THREE.MeshStandardMaterial({
    color,
    ...(map ? { map } : {}),
    roughness,
    metalness: 0,
    envMap: ctx.env,
    envMapIntensity: S.environment.env,
  });
}

function luminous(color: number, strength: number, map?: THREE.Texture) {
  const material = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(strength), map });
  material.userData.renderOrder = 11;
  return material;
}

/** 蜂蜜色木纹：细而浅的纹路，不用深黑线，避免近看变成粗糙的卡通木板 */
function woodTexture() {
  const [c, ctx] = makeCanvas(256, 256);
  ctx.fillStyle = '#f2e8d8';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 76; i++) {
    const y = (i * 47) % 256;
    const shade = 146 + ((i * 31) % 64);
    ctx.strokeStyle = `rgba(${shade},${shade - 20},${shade - 39},${0.07 + (i % 6) * 0.015})`;
    ctx.lineWidth = 0.7 + (i % 3) * 0.55;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(70, y + (i % 5) - 2, 176, y - (i % 7) + 3, 256, y + (i % 3) - 1);
    ctx.stroke();
  }
  return canvasTexture(c);
}

/** 地板：512 内画完 planks 和木纹；接缝很轻，整体仍是明亮的蜂蜜色 */
function floorTexture() {
  const [c, ctx] = makeCanvas(512, 512);
  const base = new THREE.Color(P.floor).getHSL({ h: 0, s: 0, l: 0 }, THREE.SRGBColorSpace);
  const rows = 8;
  const rh = 512 / rows;
  for (let row = 0; row < rows; row++) {
    let x = -((row * 137) % 210);
    let n = 0;
    while (x < 512) {
      const w = 190 + ((row * 43 + n * 67) % 105);
      const light = Math.min(0.8, base.l + 0.035 + ((row * 7 + n * 3) % 7) * 0.008);
      ctx.fillStyle = `hsl(${Math.round(base.h * 360)}, ${Math.round(base.s * 75)}%, ${Math.round(light * 100)}%)`;
      ctx.fillRect(x, row * rh, w, rh);
      ctx.strokeStyle = 'rgba(91, 57, 30, 0.17)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x + 0.75, row * rh + 0.75, w - 1.5, rh - 1.5);
      for (let k = 0; k < 7; k++) {
        const y = row * rh + 7 + ((k * 11 + n * 5) % (rh - 12));
        ctx.strokeStyle = 'rgba(105, 67, 37, 0.075)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(x + 4, y);
        ctx.bezierCurveTo(x + w * 0.3, y + 2, x + w * 0.65, y - 2, x + w - 4, y + 1);
        ctx.stroke();
      }
      x += w;
      n++;
    }
  }
  const texture = canvasTexture(c);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1.7, 1.25);
  return texture;
}

/** 米白织物的细十字纹；贴图接近白色，具体颜色仍由材质统一控制 */
function fabricTexture() {
  const [c, ctx] = makeCanvas(256, 256);
  ctx.fillStyle = '#f6f3ed';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 256; i += 4) {
    ctx.strokeStyle = i % 8 ? 'rgba(95,77,57,0.045)' : 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 256);
    ctx.moveTo(0, i);
    ctx.lineTo(256, i);
    ctx.stroke();
  }
  const texture = canvasTexture(c);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 2);
  return texture;
}

/** 小毯子的陶土红底和两条米白边，不用图片素材 */
function blanketTexture() {
  const [c, ctx] = makeCanvas(256, 256);
  ctx.fillStyle = '#f1e9df';
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = '#d9d0c4';
  ctx.fillRect(0, 28, 256, 10);
  ctx.fillRect(0, 48, 256, 4);
  for (let y = 0; y < 256; y += 4) {
    ctx.strokeStyle = 'rgba(78,51,39,0.055)';
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(256, y);
    ctx.stroke();
  }
  return canvasTexture(c);
}

/** 窗外傍晚：暖色天空、落日与很远的两重山，只让这一片窗景发亮 */
function sunsetTexture() {
  const [c, ctx] = makeCanvas(256, 512);
  const sky = ctx.createLinearGradient(0, 0, 0, 512);
  sky.addColorStop(0, '#8999b8');
  sky.addColorStop(0.45, '#c6b4bd');
  sky.addColorStop(0.76, '#f2b48f');
  sky.addColorStop(1, '#f6cf9d');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 256, 512);
  const sun = ctx.createRadialGradient(177, 337, 2, 177, 337, 46);
  sun.addColorStop(0, 'rgba(255,244,197,1)');
  sun.addColorStop(0.36, 'rgba(255,220,158,0.92)');
  sun.addColorStop(1, 'rgba(255,192,139,0)');
  ctx.fillStyle = sun;
  ctx.fillRect(125, 285, 104, 104);
  ctx.fillStyle = '#ffe8b3';
  ctx.beginPath();
  ctx.arc(177, 337, 19, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#a08b91';
  ctx.beginPath();
  ctx.moveTo(0, 407);
  ctx.bezierCurveTo(46, 369, 74, 403, 117, 385);
  ctx.bezierCurveTo(163, 362, 198, 401, 256, 374);
  ctx.lineTo(256, 512);
  ctx.lineTo(0, 512);
  ctx.fill();
  ctx.fillStyle = '#756f7d';
  ctx.beginPath();
  ctx.moveTo(0, 443);
  ctx.bezierCurveTo(52, 409, 95, 457, 147, 419);
  ctx.bezierCurveTo(190, 395, 219, 439, 256, 421);
  ctx.lineTo(256, 512);
  ctx.lineTo(0, 512);
  ctx.fill();
  return canvasTexture(c);
}

/** 一张软边深色圆斑，代替实时阴影；透明层级高于暗幕 */
function shadowTexture() {
  const [c, ctx] = makeCanvas(128, 128);
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  g.addColorStop(0, 'rgba(255,255,255,0.8)');
  g.addColorStop(0.42, 'rgba(255,255,255,0.48)');
  g.addColorStop(0.76, 'rgba(255,255,255,0.13)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return canvasTexture(c);
}

interface Materials {
  wall: THREE.MeshStandardMaterial;
  wallLow: THREE.MeshStandardMaterial;
  ceiling: THREE.MeshStandardMaterial;
  wood: THREE.MeshStandardMaterial;
  woodDark: THREE.MeshStandardMaterial;
  floor: THREE.MeshStandardMaterial;
  fabric: THREE.MeshStandardMaterial;
  fabricShade: THREE.MeshStandardMaterial;
  blanket: THREE.MeshStandardMaterial;
  curtain: THREE.MeshStandardMaterial;
  accent: THREE.MeshStandardMaterial;
  brass: THREE.MeshStandardMaterial;
  leaf: THREE.MeshStandardMaterial;
  soil: THREE.MeshStandardMaterial;
  shadow: THREE.MeshBasicMaterial;
  glow: THREE.MeshBasicMaterial;
  sky: THREE.MeshBasicMaterial;
}

const MATERIAL_CACHE = new WeakMap<RoomContext, Materials>();

function materials(ctx: RoomContext): Materials {
  const cached = MATERIAL_CACHE.get(ctx);
  if (cached) return cached;
  const grain = woodTexture();
  const cloth = fabricTexture();
  const brass = surface(ctx, P.brass, 0.52);
  brass.metalness = 0.32;
  const shadow = new THREE.MeshBasicMaterial({
    map: shadowTexture(), color: 0x3b3028, transparent: true, opacity: 0.3, depthWrite: false, fog: false,
  });
  shadow.userData.renderOrder = 10.2;
  const made: Materials = {
    wall: surface(ctx, P.wall, 0.96),
    wallLow: surface(ctx, P.wallLow, 0.96),
    ceiling: surface(ctx, P.ceiling, 0.98),
    wood: surface(ctx, P.wood, 0.76, grain),
    woodDark: surface(ctx, P.woodDark, 0.82, grain),
    floor: surface(ctx, 0xffffff, 0.82, floorTexture()),
    fabric: surface(ctx, P.fabric, 1, cloth),
    fabricShade: surface(ctx, P.fabricShade, 1, cloth),
    blanket: surface(ctx, P.accent, 1, blanketTexture()),
    curtain: surface(ctx, P.curtain, 1, cloth),
    accent: surface(ctx, P.accent, 0.9),
    brass,
    leaf: surface(ctx, P.leaf, 0.92),
    soil: surface(ctx, 0x59483a, 1),
    shadow,
    glow: luminous(0xffd19a, S.glow.bulbs),
    sky: luminous(0xffffff, S.glow.window, sunsetTexture()),
  };
  MATERIAL_CACHE.set(ctx, made);
  return made;
}

function contact(parts: Parts, m: Materials, w: number, d: number, z = 0) {
  parts.add(new THREE.PlaneGeometry(w, d), m.shadow, [0, 0.005, z], [1, 1, 1], [-Math.PI / 2, 0, 0]);
}

function rounded(w: number, h: number, d: number, radius = 0.035) {
  return new RoundedBoxGeometry(w, h, d, 3, Math.min(radius, w / 2, h / 2, d / 2));
}

/** 房间壳：背墙、两侧墙、木地板和一点天花板；它不参与点击，点墙仍可返回 */
export function buildRoomShell(ctx: RoomContext) {
  const m = materials(ctx);
  const p = new Parts();
  const { w, d, h } = S.room;
  const back = -d / 2;
  p.add(new THREE.BoxGeometry(w + 0.14, 0.06, d + 0.08), m.floor, [0, -0.03, 0]);
  p.add(new THREE.BoxGeometry(w + 0.12, h, 0.08), m.wall, [0, h / 2, back - 0.04]);
  for (const side of [-1, 1]) {
    p.add(new THREE.BoxGeometry(0.08, h, d + 0.08), m.wall, [side * (w / 2 + 0.04), h / 2, 0]);
    p.add(new THREE.BoxGeometry(0.018, 0.76, d), m.wallLow, [side * (w / 2 - 0.002), 0.38, 0]);
    p.add(rounded(0.055, 0.055, d, 0.015), m.ceiling, [side * (w / 2 - 0.025), 0.79, 0]);
    p.add(rounded(0.07, 0.11, d, 0.018), m.ceiling, [side * (w / 2 - 0.035), 0.055, 0]);
    p.add(rounded(0.09, 0.09, d, 0.025), m.ceiling, [side * (w / 2 - 0.035), h - 0.045, 0]);
  }
  p.add(new THREE.BoxGeometry(w, 0.76, 0.018), m.wallLow, [0, 0.38, back + 0.008]);
  p.add(rounded(w, 0.055, 0.055, 0.015), m.ceiling, [0, 0.79, back + 0.025]);
  p.add(rounded(w, 0.11, 0.07, 0.018), m.ceiling, [0, 0.055, back + 0.035]);
  p.add(rounded(w, 0.09, 0.09, 0.025), m.ceiling, [0, h - 0.045, back + 0.035]);
  p.add(new THREE.BoxGeometry(w + 0.12, 0.06, d + 0.08), m.ceiling, [0, h + 0.03, 0]);
  return p.finish();
}

/** 矮柜：原点为四脚落地的中心；柜面高度严格使用 CONFIG.shrine.cabinet.h */
export function buildCabinet(ctx: RoomContext) {
  const m = materials(ctx);
  const p = new Parts();
  const { w, d, h } = S.cabinet;
  contact(p, m, w + 0.34, d + 0.34, 0.04);
  for (const x of [-1, 1]) {
    for (const z of [-1, 1]) {
      p.add(new THREE.CylinderGeometry(0.034, 0.047, 0.17, 20), m.woodDark, [x * (w / 2 - 0.12), 0.085, z * (d / 2 - 0.085)]);
    }
  }
  p.add(rounded(w - 0.05, h - 0.19, d - 0.045, 0.065), m.wood, [0, 0.17 + (h - 0.19) / 2, -0.008]);
  p.add(rounded(w + 0.045, 0.075, d + 0.035, 0.035), m.wood, [0, h - 0.0375, 0]);
  const doorW = (w - 0.15) / 2;
  for (const side of [-1, 1]) {
    p.add(rounded(doorW, h - 0.29, 0.038, 0.035), m.woodDark, [side * (doorW / 2 + 0.018), 0.19 + (h - 0.29) / 2, d / 2 + 0.006]);
    p.add(rounded(doorW - 0.045, h - 0.335, 0.026, 0.03), m.wood, [side * (doorW / 2 + 0.018), 0.19 + (h - 0.29) / 2, d / 2 + 0.029]);
    p.add(new THREE.SphereGeometry(0.018, 18, 12), m.brass, [side * 0.075, h - 0.19, d / 2 + 0.057], [1, 1, 0.65]);
  }
  // 铜牌仍留在柜体正面；文字由 Shrine 按宠物生成后放在同一锚点
  p.add(rounded(0.5, 0.072, 0.012, 0.012), m.brass, [0, h * 0.69, d / 2 + 0.055]);
  return p.finish();
}

/** 圆形宠物窝：鼓垫、柔软外圈和搭在前沿的小毯子 */
export function buildPetBed(ctx: RoomContext) {
  const m = materials(ctx);
  const p = new Parts();
  const r = S.bed.radius;
  contact(p, m, r * 2.35, r * 2.2);
  p.add(new THREE.SphereGeometry(1, 36, 20), m.fabricShade, [0, 0.12, 0], [r * 0.91, 0.13, r * 0.91]);
  p.add(new THREE.TorusGeometry(r * 0.76, r * 0.235, 20, 64), m.fabric, [0, 0.22, 0], [1, 1, 1], [Math.PI / 2, 0, 0]);
  p.add(new THREE.SphereGeometry(1, 36, 20), m.fabric, [0, 0.17, 0], [r * 0.66, 0.105, r * 0.66]);
  p.add(new THREE.TorusGeometry(r * 0.73, 0.012, 10, 64), m.fabricShade, [0, 0.293, 0], [1, 1, 1], [Math.PI / 2, 0, 0]);

  const blanket = new THREE.PlaneGeometry(0.48, 0.62, 14, 18);
  blanket.rotateX(-Math.PI / 2);
  const a = blanket.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < a.count; i++) {
    const x = a.getX(i);
    const z = a.getZ(i);
    const hang = THREE.MathUtils.smoothstep(z, -0.05, 0.31);
    a.setY(i, 0.32 - hang * 0.27 + Math.sin(x * 25 + z * 9) * 0.009);
    a.setZ(i, z + 0.23);
  }
  blanket.computeVertexNormals();
  m.blanket.side = THREE.DoubleSide;
  p.add(blanket, m.blanket, [0.18, 0, 0.03], [1, 1, 1], [0, -0.28, 0]);
  return p.finish();
}

/** 窝下面的圆地毯：两道很浅的织边，不再额外发光 */
export function buildRoundRug(ctx: RoomContext) {
  const m = materials(ctx);
  const p = new Parts();
  p.add(new THREE.CylinderGeometry(0.94, 0.94, 0.018, 64), m.fabricShade, [0, 0.009, 0]);
  p.add(new THREE.CylinderGeometry(0.895, 0.895, 0.02, 64), m.fabric, [0, 0.013, 0]);
  for (const r of [0.78, 0.825]) p.add(new THREE.TorusGeometry(r, 0.008, 8, 64), m.fabricShade, [0, 0.026, 0], [1, 1, 1], [Math.PI / 2, 0, 0]);
  return p.finish();
}

/** 两只圆润的陶瓷碗，稍微错开，像刚用过 */
export function buildBowls(ctx: RoomContext) {
  const m = materials(ctx);
  const p = new Parts();
  contact(p, m, 0.68, 0.38);
  const profile = [
    new THREE.Vector2(0, 0), new THREE.Vector2(0.085, 0), new THREE.Vector2(0.125, 0.025),
    new THREE.Vector2(0.145, 0.085), new THREE.Vector2(0.143, 0.105), new THREE.Vector2(0.126, 0.108),
    new THREE.Vector2(0.112, 0.04), new THREE.Vector2(0, 0.025),
  ];
  p.add(new THREE.LatheGeometry(profile, 36), m.accent, [-0.16, 0, 0]);
  p.add(new THREE.LatheGeometry(profile, 36), m.fabric, [0.16, 0, 0.035]);
  p.add(new THREE.CylinderGeometry(0.105, 0.105, 0.004, 32), m.fabricShade, [-0.16, 0.047, 0]);
  for (let i = 0; i < 5; i++) {
    p.add(new THREE.SphereGeometry(0.014, 12, 8), m.woodDark, [-0.2 + (i % 3) * 0.035, 0.057, -0.025 + Math.floor(i / 3) * 0.04], [1, 0.65, 1]);
  }
  return p.finish();
}

/** 随意落在窝边的小球 */
export function buildBall(ctx: RoomContext) {
  const m = materials(ctx);
  const p = new Parts();
  contact(p, m, 0.18, 0.16);
  p.add(new THREE.SphereGeometry(0.062, 28, 18), m.accent, [0, 0.062, 0]);
  p.add(new THREE.TorusGeometry(0.059, 0.007, 10, 36), m.fabric, [0, 0.062, 0], [1, 1, 1], [Math.PI / 2, 0.25, 0]);
  return p.finish();
}

/** 右侧只放这一盏落地灯：圆底座、细杆、亚麻灯罩 */
export function buildFloorLamp(ctx: RoomContext) {
  const m = materials(ctx);
  const p = new Parts();
  const h = S.floorLamp.h;
  contact(p, m, 0.65, 0.58);
  p.add(new THREE.CylinderGeometry(0.23, 0.25, 0.045, 40), m.woodDark, [0, 0.0225, 0]);
  p.add(new THREE.CylinderGeometry(0.015, 0.019, h - 0.36, 20), m.brass, [0, (h - 0.36) / 2 + 0.04, 0]);
  const shadeMat = luminous(0xffddb0, S.glow.shade);
  shadeMat.side = THREE.DoubleSide;
  p.add(new THREE.CylinderGeometry(0.18, 0.3, 0.37, 48, 1, true), shadeMat, [0, h - 0.205, 0]);
  p.add(new THREE.TorusGeometry(0.3, 0.009, 10, 48), m.fabricShade, [0, h - 0.39, 0], [1, 1, 1], [Math.PI / 2, 0, 0]);
  p.add(new THREE.TorusGeometry(0.18, 0.007, 10, 48), m.fabricShade, [0, h - 0.02, 0], [1, 1, 1], [Math.PI / 2, 0, 0]);
  return p.finish();
}

/** 墙上搁板：项圈、两个小相框和唯一一串暖色小灯泡；植物由独立函数摆放 */
export function buildShelf(ctx: RoomContext) {
  const m = materials(ctx);
  const p = new Parts();
  const { w, d, y } = S.shelf;
  p.add(rounded(w, 0.065, d, 0.028), m.wood, [0, y, 0]);
  // 项圈轻轻靠在搁板前方，铜牌是它的吊牌
  p.add(new THREE.TorusGeometry(0.105, 0.014, 12, 40), m.accent, [-0.31, y + 0.18, 0.015], [1, 1.12, 1]);
  p.add(new THREE.SphereGeometry(0.025, 18, 12), m.brass, [-0.31, y + 0.055, 0.035], [1, 1, 0.35]);

  const frames: Array<{ x: number; size: number; tilt: number }> = [
    { x: -0.04, size: 0.22, tilt: -0.08 },
    { x: 0.19, size: 0.18, tilt: 0.09 },
  ];
  for (const f of frames) {
    const frame = new THREE.Group();
    frame.position.set(f.x, y + 0.04 + f.size / 2, -0.015);
    frame.rotation.z = f.tilt;
    const fp = new Parts();
    fp.add(rounded(f.size + 0.035, f.size + 0.035, 0.025, 0.018), m.woodDark);
    fp.add(rounded(f.size + 0.012, f.size + 0.012, 0.012, 0.01), m.fabric, [0, 0, 0.018]);
    frame.add(fp.finish());
    const photo = new THREE.Mesh(new THREE.PlaneGeometry(f.size - 0.018, f.size - 0.018), ctx.photoMaterial);
    photo.position.z = 0.026;
    photo.renderOrder = 1;
    frame.add(photo);
    ctx.photos.push(photo);
    p.mesh(frame);
  }

  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= 16; i++) {
    const x = -w * 0.52 + (i / 16) * w * 1.04;
    points.push(new THREE.Vector3(x, y + 0.68 - Math.sin((i / 16) * Math.PI) * 0.12, -0.015));
  }
  p.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 48, 0.0045, 6, false), m.woodDark);
  for (let i = 1; i < 8; i++) {
    const v = points[i * 2];
    p.beam(m.woodDark, [v.x, v.y, v.z], [v.x, v.y - 0.035, v.z], 0.003);
    p.add(new THREE.SphereGeometry(0.021, 16, 12), m.glow, [v.x, v.y - 0.047, v.z]);
  }
  return p.finish();
}

/** 墙上的一扇窗：原点在与地板相交的墙中心，窗框、半开窗帘和傍晚窗景都从这里长出 */
export function buildWindow(ctx: RoomContext) {
  const m = materials(ctx);
  const p = new Parts();
  const { w, h, y } = S.window;
  p.add(rounded(w + 0.16, h + 0.16, 0.06, 0.04), m.ceiling, [0, y, 0.025]);
  p.add(new THREE.PlaneGeometry(w, h), m.sky, [0, y, 0.06]);
  for (const side of [-1, 1]) {
    p.add(rounded(0.055, h + 0.035, 0.055, 0.018), m.fabric, [side * w / 2, y, 0.085]);
    p.add(rounded(w + 0.035, 0.055, 0.055, 0.018), m.fabric, [0, y + side * h / 2, 0.085]);
  }
  p.add(rounded(0.035, h, 0.04, 0.012), m.fabric, [0, y, 0.092]);
  p.add(rounded(w, 0.035, 0.04, 0.012), m.fabric, [0, y - 0.05, 0.092]);
  p.add(rounded(w + 0.28, 0.065, 0.24, 0.025), m.ceiling, [0, y - h / 2 - 0.075, 0.095]);

  const rodY = y + h / 2 + 0.16;
  p.add(new THREE.CylinderGeometry(0.015, 0.015, w + 0.52, 20), m.woodDark, [0, rodY, 0.14], [1, 1, 1], [0, 0, Math.PI / 2]);
  for (const side of [-1, 1]) {
    p.add(new THREE.SphereGeometry(0.032, 20, 14), m.woodDark, [side * (w / 2 + 0.28), rodY, 0.14]);
    const panelW = side < 0 ? 0.37 : 0.32;
    const curtain = new THREE.PlaneGeometry(panelW, h + 0.31, 16, 22);
    const a = curtain.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < a.count; i++) {
      const x = a.getX(i);
      const cy = a.getY(i);
      a.setZ(i, Math.cos((x / panelW + 0.5) * Math.PI * 8) * 0.025);
      if (cy < -(h + 0.31) / 2 + 0.02) a.setY(i, cy + 0.018 * Math.cos(x * 28));
    }
    curtain.computeVertexNormals();
    m.curtain.side = THREE.DoubleSide;
    const cx = side * (w / 2 - panelW * 0.24);
    p.add(curtain, m.curtain, [cx, y + 0.06, 0.16]);
    for (let i = 0; i < 5; i++) {
      p.add(new THREE.TorusGeometry(0.019, 0.004, 6, 16), m.brass, [cx - panelW * 0.4 + i * panelW * 0.2, rodY - 0.018, 0.14]);
    }
  }
  return p.finish();
}

/** 搁板上的小盆栽：原点为盆底中心，陶土盆和圆润叶片 */
export function buildPlant(ctx: RoomContext) {
  const m = materials(ctx);
  const p = new Parts();
  const profile = [
    new THREE.Vector2(0, 0), new THREE.Vector2(0.07, 0), new THREE.Vector2(0.09, 0.025),
    new THREE.Vector2(0.115, 0.16), new THREE.Vector2(0.105, 0.175), new THREE.Vector2(0.095, 0.155),
    new THREE.Vector2(0.08, 0.04), new THREE.Vector2(0, 0.035),
  ];
  p.add(new THREE.LatheGeometry(profile, 36), m.accent);
  p.add(new THREE.CylinderGeometry(0.094, 0.094, 0.012, 32), m.soil, [0, 0.145, 0]);
  const leaves: Array<{ tip: Vec3; rot: Vec3; scale: Vec3 }> = [
    { tip: [-0.11, 0.33, 0.015], rot: [0.2, 0, 0.72], scale: [0.055, 0.11, 0.025] },
    { tip: [0.11, 0.37, 0.015], rot: [-0.15, 0.2, -0.68], scale: [0.055, 0.12, 0.025] },
    { tip: [-0.035, 0.43, -0.025], rot: [0.25, 0.4, 0.2], scale: [0.052, 0.12, 0.024] },
    { tip: [0.045, 0.3, 0.085], rot: [0.75, 0, -0.35], scale: [0.06, 0.105, 0.025] },
    { tip: [-0.07, 0.28, -0.075], rot: [-0.7, 0.2, 0.45], scale: [0.052, 0.1, 0.023] },
    { tip: [0.13, 0.26, -0.04], rot: [-0.4, 0.5, -0.9], scale: [0.05, 0.09, 0.022] },
  ];
  for (const leaf of leaves) {
    p.beam(m.leaf, [0, 0.15, 0], leaf.tip, 0.004);
    p.add(new THREE.SphereGeometry(1, 20, 14), m.leaf, leaf.tip, leaf.scale, leaf.rot);
  }
  return p.finish();
}

/** 按布置表摆放一件家具；调用方可以用同一个位置换入 GLB */
export function place(object: THREE.Group, placement: { at: [number, number, number]; yaw: number; scale: number }, floor: number) {
  object.position.set(placement.at[0], floor + placement.at[1], placement.at[2]);
  object.rotation.y = placement.yaw;
  object.scale.setScalar(placement.scale);
  return object;
}
