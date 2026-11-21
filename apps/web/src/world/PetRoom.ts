import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG } from '../config';
import { canvasTexture, glowTexture, makeCanvas } from './textures';

const S = CONFIG.shrine;
const P = S.palette;

export interface RoomContext {
  /** 茶几主照片使用主场景已经加载好的宠物 atlas */
  photoMaterial: THREE.MeshBasicMaterial;
  mainPhoto?: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  frameMaterial?: THREE.MeshStandardMaterial;
  /** 两块搁板小相框各有独立材质，换宠物时换成相册里的其他照片 */
  albumPhotos: THREE.MeshBasicMaterial[];
  /** 唯一的香薰蜡烛：罐子常驻，火苗和光晕按是否收到过蜡烛显示 */
  candleFlame?: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  candleGlow?: THREE.Sprite;
}

type Vec3 = [number, number, number];
type Mat = THREE.Material;

/** 静态零件按材质合并；透明件、照片和需要动画的物件直接留在 Group 里 */
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

  beam(material: Mat, from: Vec3, to: Vec3, radius: number, segments = 14) {
    const a = new THREE.Vector3(...from);
    const b = new THREE.Vector3(...to);
    const delta = b.clone().sub(a);
    const geometry = new THREE.CylinderGeometry(radius, radius, delta.length(), segments);
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
      if (!geometry) throw new Error('客厅静态零件合并失败');
      const mesh = new THREE.Mesh(geometry, material);
      mesh.renderOrder = material.userData.renderOrder ?? (material.transparent ? 11 : 0);
      mesh.castShadow = !material.transparent && material.userData.noShadow !== true;
      mesh.receiveShadow = material.userData.noShadow !== true;
      mesh.userData.contactShadow = material.userData.contactShadow === true;
      this.group.add(mesh);
      for (const g of list) g.dispose();
      for (const g of flat) if (!list.includes(g)) g.dispose();
    }
    this.buckets.clear();
    return this.group;
  }
}

function surface(color: number, roughness = 0.86, map?: THREE.Texture) {
  return new THREE.MeshStandardMaterial({ color, ...(map ? { map } : {}), roughness, metalness: 0 });
}

function luminous(color: number, strength: number, map?: THREE.Texture) {
  const material = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(strength), ...(map ? { map } : {}) });
  material.userData.noShadow = true;
  material.userData.renderOrder = 11;
  return material;
}

/** 蜂蜜色木纹，所有贴图都不超过 512 */
function woodTexture() {
  const [c, ctx] = makeCanvas(256, 256);
  ctx.fillStyle = '#eee2d1';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 72; i++) {
    const y = (i * 47) % 256;
    const shade = 140 + ((i * 31) % 66);
    ctx.strokeStyle = `rgba(${shade},${shade - 22},${shade - 40},${0.06 + (i % 6) * 0.014})`;
    ctx.lineWidth = 0.7 + (i % 3) * 0.5;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(70, y + (i % 5) - 2, 176, y - (i % 7) + 3, 256, y + (i % 3) - 1);
    ctx.stroke();
  }
  return canvasTexture(c);
}

/** 深红棕木地板：长板、细接缝和很轻的沿线纹理 */
function floorTexture() {
  const [c, ctx] = makeCanvas(512, 512);
  const base = new THREE.Color(P.floor).getHSL({ h: 0, s: 0, l: 0 }, THREE.SRGBColorSpace);
  const rows = 9;
  const rh = 512 / rows;
  for (let row = 0; row < rows; row++) {
    let x = -((row * 137) % 210);
    let n = 0;
    while (x < 512) {
      const w = 185 + ((row * 43 + n * 67) % 110);
      const light = base.l + (((row * 7 + n * 3) % 7) - 3) * 0.009;
      ctx.fillStyle = `hsl(${Math.round(base.h * 360)}, ${Math.round(base.s * 88)}%, ${Math.round(light * 100)}%)`;
      ctx.fillRect(x, row * rh, w, rh);
      ctx.strokeStyle = 'rgba(24,12,10,0.28)';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(x + 0.6, row * rh + 0.6, w - 1.2, rh - 1.2);
      for (let k = 0; k < 6; k++) {
        const y = row * rh + 6 + ((k * 13 + n * 5) % (rh - 10));
        ctx.strokeStyle = 'rgba(238,180,130,0.045)';
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
  texture.repeat.set(1.6, 1.8);
  return texture;
}

function fabricTexture() {
  const [c, ctx] = makeCanvas(256, 256);
  ctx.fillStyle = '#f5f1e9';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 256; i += 4) {
    ctx.strokeStyle = i % 8 ? 'rgba(92,73,54,0.045)' : 'rgba(255,255,255,0.18)';
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

/** 海上日落：天空、海面、横向波纹和太阳下方断续的反光 */
function sunsetTexture() {
  const [c, ctx] = makeCanvas(512, 512);
  const sky = ctx.createLinearGradient(0, 0, 0, 300);
  sky.addColorStop(0, '#879bb7');
  sky.addColorStop(0.52, '#d5b5b1');
  sky.addColorStop(1, '#f6c28e');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 512, 300);
  const sea = ctx.createLinearGradient(0, 300, 0, 512);
  sea.addColorStop(0, '#bd9b99');
  sea.addColorStop(0.45, '#8c8b9c');
  sea.addColorStop(1, '#596f82');
  ctx.fillStyle = sea;
  ctx.fillRect(0, 300, 512, 212);
  ctx.fillStyle = '#f8dfaa';
  ctx.fillRect(0, 297, 512, 3);
  for (let i = 0; i < 66; i++) {
    const y = 306 + ((i * 29) % 196);
    const center = 326 + Math.sin(i * 2.1) * (12 + (y - 300) * 0.12);
    const w = 12 + ((i * 37) % 78) + (y - 300) * 0.18;
    ctx.strokeStyle = `rgba(255,211,151,${0.12 + (i % 5) * 0.055})`;
    ctx.lineWidth = 1 + (i % 3);
    ctx.beginPath();
    ctx.moveTo(center - w / 2, y);
    ctx.lineTo(center + w / 2, y + (i % 2));
    ctx.stroke();
  }
  for (let i = 0; i < 34; i++) {
    const y = 312 + ((i * 41) % 190);
    const x = (i * 83) % 512;
    ctx.strokeStyle = 'rgba(226,220,215,0.13)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(Math.min(512, x + 35 + (i % 4) * 17), y);
    ctx.stroke();
  }
  return canvasTexture(c);
}

function shadowTexture() {
  const [c, ctx] = makeCanvas(128, 128);
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  g.addColorStop(0, 'rgba(255,255,255,0.78)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.42)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return canvasTexture(c);
}

interface Materials {
  wall: THREE.MeshStandardMaterial;
  wallLow: THREE.MeshStandardMaterial;
  ceiling: THREE.MeshStandardMaterial;
  trim: THREE.MeshStandardMaterial;
  wood: THREE.MeshStandardMaterial;
  woodDark: THREE.MeshStandardMaterial;
  floor: THREE.MeshStandardMaterial;
  fabric: THREE.MeshStandardMaterial;
  fabricShade: THREE.MeshStandardMaterial;
  curtain: THREE.MeshStandardMaterial;
  accent: THREE.MeshStandardMaterial;
  brass: THREE.MeshStandardMaterial;
  leaf: THREE.MeshStandardMaterial;
  soil: THREE.MeshStandardMaterial;
  glass: THREE.MeshStandardMaterial;
  shadow: THREE.MeshBasicMaterial;
  shade: THREE.MeshBasicMaterial;
  sky: THREE.MeshBasicMaterial;
  sun: THREE.MeshBasicMaterial;
  bulbOn: THREE.MeshBasicMaterial;
}

const MATERIAL_CACHE = new WeakMap<RoomContext, Materials>();

function materials(ctx: RoomContext): Materials {
  const cached = MATERIAL_CACHE.get(ctx);
  if (cached) return cached;
  const grain = woodTexture();
  const cloth = fabricTexture();
  const wall = surface(P.wall, 0.96);
  const wallLow = surface(P.wallLow, 0.96);
  const ceiling = surface(P.ceiling, 0.98);
  const floor = surface(0xffffff, 0.82, floorTexture());
  for (const m of [wall, wallLow, ceiling, floor]) m.userData.noShadow = true;
  const trim = surface(P.trim, 0.9);
  const brass = surface(P.brass, 0.52);
  brass.metalness = 0.28;
  brass.userData.noShadow = true;
  const shadow = new THREE.MeshBasicMaterial({ map: shadowTexture(), color: 0x35251f, transparent: true, opacity: 0.28, depthWrite: false, fog: false });
  shadow.userData.contactShadow = true;
  shadow.userData.noShadow = true;
  const glass = new THREE.MeshStandardMaterial({ color: 0xd8e5df, roughness: 0.16, transparent: true, opacity: 0.24, depthWrite: false, side: THREE.DoubleSide });
  glass.userData.noShadow = true;
  const made: Materials = {
    wall,
    wallLow,
    ceiling,
    trim,
    wood: surface(P.wood, 0.74, grain),
    woodDark: surface(P.woodDark, 0.82, grain),
    floor,
    fabric: surface(P.fabric, 1, cloth),
    fabricShade: surface(P.fabricShade, 1, cloth),
    curtain: (() => {
      const material = surface(P.curtain, 1, cloth);
      // 窗帘很薄，不把褶皱和挂环的影子硬投到窗台上
      material.userData.noShadow = true;
      return material;
    })(),
    accent: surface(P.accent, 0.9),
    brass,
    leaf: surface(P.leaf, 0.92),
    soil: surface(0x59483a, 1),
    glass,
    shadow,
    shade: luminous(0xffddb0, S.glow.shade),
    sky: luminous(0xffffff, 0.94, sunsetTexture()),
    sun: luminous(0xffdf9e, S.glow.sun),
    bulbOn: luminous(0xffd19a, S.glow.bulbs),
  };
  MATERIAL_CACHE.set(ctx, made);
  return made;
}

function rounded(w: number, h: number, d: number, radius = 0.035) {
  return new RoundedBoxGeometry(w, h, d, 3, Math.min(radius, w / 2, h / 2, d / 2));
}

function contact(parts: Parts, m: Materials, w: number, d: number, z = 0) {
  parts.add(new THREE.PlaneGeometry(w, d), m.shadow, [0, 0.005, z], [1, 1, 1], [-Math.PI / 2, 0, 0]);
}

/** 房间壳体：背墙开出真正的窗洞，侧墙和地板延伸到门口镜头之外 */
export function buildRoomShell(ctx: RoomContext) {
  const m = materials(ctx);
  const p = new Parts();
  const { w, d, h } = S.room;
  const back = -d / 2;
  const entryDepth = d + 2;
  const centerZ = 0.8;
  p.add(new THREE.BoxGeometry(w + 0.12, 0.06, entryDepth), m.floor, [0, -0.03, centerZ]);
  p.add(new THREE.BoxGeometry(w + 0.12, 0.06, entryDepth), m.ceiling, [0, h + 0.03, centerZ]);
  for (const side of [-1, 1]) {
    p.add(new THREE.BoxGeometry(0.08, h, entryDepth), m.wall, [side * (w / 2 + 0.04), h / 2, centerZ]);
    p.add(new THREE.BoxGeometry(0.018, 0.76, entryDepth), m.wallLow, [side * (w / 2 - 0.002), 0.38, centerZ]);
    p.add(rounded(0.055, 0.055, entryDepth, 0.015), m.trim, [side * (w / 2 - 0.025), 0.79, centerZ]);
    p.add(rounded(0.07, 0.11, entryDepth, 0.018), m.trim, [side * (w / 2 - 0.035), 0.055, centerZ]);
    p.add(rounded(0.09, 0.09, entryDepth, 0.025), m.trim, [side * (w / 2 - 0.035), h - 0.045, centerZ]);
  }
  const ww = S.window.w;
  const wh = S.window.h;
  const wy = S.window.y;
  const sideW = (w - ww) / 2;
  for (const side of [-1, 1]) {
    p.add(new THREE.BoxGeometry(sideW, h, 0.08), m.wall, [side * (ww / 2 + sideW / 2), h / 2, back - 0.04]);
    p.add(new THREE.BoxGeometry(sideW, 0.76, 0.018), m.wallLow, [side * (ww / 2 + sideW / 2), 0.38, back + 0.008]);
  }
  const bottom = wy - wh / 2;
  const top = wy + wh / 2;
  p.add(new THREE.BoxGeometry(ww, bottom, 0.08), m.wall, [0, bottom / 2, back - 0.04]);
  p.add(new THREE.BoxGeometry(ww, h - top, 0.08), m.wall, [0, top + (h - top) / 2, back - 0.04]);
  p.add(new THREE.BoxGeometry(ww, Math.min(0.76, bottom), 0.018), m.wallLow, [0, Math.min(0.76, bottom) / 2, back + 0.008]);
  p.add(rounded(w, 0.055, 0.055, 0.015), m.trim, [0, 0.79, back + 0.025]);
  p.add(rounded(w, 0.11, 0.07, 0.018), m.trim, [0, 0.055, back + 0.035]);
  p.add(rounded(w, 0.09, 0.09, 0.025), m.trim, [0, h - 0.045, back + 0.035]);
  return p.finish();
}

/** 背墙大窗、两侧半开窗帘、木杆和六只可控灯泡 */
export function buildWindow(ctx: RoomContext) {
  const m = materials(ctx);
  const p = new Parts();
  const { w, h, y } = S.window;
  p.add(new THREE.PlaneGeometry(w, h), m.sky, [0, y, -0.055]);
  p.add(new THREE.CircleGeometry(0.16, 48), m.sun, [0.31, y + 0.08, -0.047]);
  for (const side of [-1, 1]) {
    p.add(rounded(0.055, h + 0.06, 0.055, 0.018), m.trim, [side * w / 2, y, 0.015]);
    p.add(rounded(w + 0.055, 0.055, 0.055, 0.018), m.trim, [0, y + side * h / 2, 0.015]);
  }
  p.add(rounded(w + 0.22, 0.065, 0.22, 0.024), m.trim, [0, y - h / 2 - 0.055, 0.045]);
  const rodY = y + h / 2 + 0.16;
  p.add(new THREE.CylinderGeometry(0.016, 0.016, w + 0.68, 24), m.woodDark, [0, rodY, 0.12], [1, 1, 1], [0, 0, Math.PI / 2]);
  for (const side of [-1, 1]) {
    p.add(new THREE.SphereGeometry(0.034, 20, 14), m.woodDark, [side * (w / 2 + 0.36), rodY, 0.12]);
    const panelW = side < 0 ? 0.4 : 0.35;
    const curtain = new THREE.PlaneGeometry(panelW, h + 0.31, 16, 22);
    const a = curtain.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < a.count; i++) {
      const x = a.getX(i);
      a.setZ(i, Math.cos((x / panelW + 0.5) * Math.PI * 8) * 0.025);
    }
    curtain.computeVertexNormals();
    m.curtain.side = THREE.DoubleSide;
    const cx = side * (w / 2 - panelW * 0.22);
    p.add(curtain, m.curtain, [cx, y + 0.06, 0.15]);
    for (let i = 0; i < 5; i++) p.add(new THREE.TorusGeometry(0.019, 0.004, 6, 16), m.brass, [cx - panelW * 0.4 + i * panelW * 0.2, rodY - 0.018, 0.12]);
  }
  // 普通装饰灯串：数量和点亮状态都与礼物无关，始终暖暖地亮着
  p.add(new THREE.CylinderGeometry(0.003, 0.003, w + 0.42, 8), m.woodDark, [0, rodY + 0.035, 0.13], [1, 1, 1], [0, 0, Math.PI / 2]);
  for (let i = 0; i < S.window.stringBulbs; i++) {
    const x = -w * 0.43 + (i / (S.window.stringBulbs - 1)) * w * 0.86;
    p.beam(m.woodDark, [x, rodY + 0.035, 0.13], [x, rodY - 0.025, 0.13], 0.0025, 6);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.03, 20, 14), m.bulbOn);
    bulb.position.set(x, rodY - 0.04, 0.13);
    bulb.renderOrder = 11;
    p.mesh(bulb);
  }
  return p.finish();
}

/** 代码沙发替代模型；开发环境 GLB 到达后也放在同一个落地 Group 中 */
export function buildSofa(ctx: RoomContext) {
  const m = materials(ctx);
  const p = new Parts();
  const w = S.sofa.w;
  contact(p, m, w + 0.25, 0.98);
  for (const x of [-1, 1]) for (const z of [-1, 1]) p.add(new THREE.CylinderGeometry(0.035, 0.045, 0.13, 18), m.woodDark, [x * (w / 2 - 0.14), 0.065, z * 0.27]);
  p.add(rounded(w, 0.25, 0.76, 0.1), m.fabricShade, [0, 0.24, 0]);
  p.add(rounded(w - 0.18, 0.58, 0.22, 0.09), m.fabric, [0, 0.59, -0.3]);
  for (const x of [-1, 1]) p.add(rounded(0.22, 0.48, 0.78, 0.09), m.fabric, [x * (w / 2 - 0.11), 0.43, 0]);
  const seatW = (w - 0.5) / 2;
  for (const side of [-1, 1]) p.add(rounded(seatW, 0.18, 0.61, 0.075), m.fabric, [side * (seatW / 2 + 0.01), 0.46, 0.055]);
  return p.finish();
}

/** 橙色靠垫的程序化替代；原点为靠垫底边中心 */
export function buildCushion(ctx: RoomContext) {
  const m = materials(ctx);
  const p = new Parts();
  p.add(rounded(0.44, 0.42, 0.17, 0.08), m.accent, [0, 0.19, 0], [1, 1, 1], [-0.12, 0, 0.06]);
  return p.finish();
}

/** 米白圆地毯 */
export function buildRoundRug(ctx: RoomContext) {
  const m = materials(ctx);
  const p = new Parts();
  p.add(new THREE.CylinderGeometry(1.22, 1.22, 0.018, 72), m.fabricShade, [0, 0.009, 0]);
  p.add(new THREE.CylinderGeometry(1.18, 1.18, 0.02, 72), m.fabric, [0, 0.013, 0]);
  for (const r of [1.05, 1.1]) p.add(new THREE.TorusGeometry(r, 0.007, 8, 72), m.fabricShade, [0, 0.026, 0], [1, 1, 1], [Math.PI / 2, 0, 0]);
  return p.finish();
}

/** 矮圆木茶几：圆润台面和三条向外倾斜的木腿 */
export function buildCoffeeTable(ctx: RoomContext) {
  const m = materials(ctx);
  const p = new Parts();
  const r = S.table.radius;
  const h = S.table.h;
  contact(p, m, r * 2.2, r * 2.2);
  for (let i = 0; i < 3; i++) {
    const a = i * Math.PI * 2 / 3 + 0.35;
    p.beam(m.woodDark, [Math.cos(a) * (r * 0.72), 0.035, Math.sin(a) * (r * 0.72)], [Math.cos(a) * (r * 0.48), h - 0.055, Math.sin(a) * (r * 0.48)], 0.052, 24);
  }
  p.add(new THREE.CylinderGeometry(r - 0.015, r - 0.025, 0.065, 64), m.wood, [0, h - 0.0325, 0]);
  p.add(new THREE.TorusGeometry(r - 0.014, 0.022, 12, 64), m.wood, [0, h - 0.022, 0], [1, 1, 1], [Math.PI / 2, 0, 0]);
  return p.finish();
}

/** 大厅给每只宠物留的框色偏深时，小屋里换成蜂蜜木，免得暖光下看起来像黑框 */
export function roomFrameColor(frame: number | undefined) {
  if (frame === undefined) return P.wood;
  const { l } = new THREE.Color(frame).getHSL({ h: 0, s: 0, l: 0 }, THREE.SRGBColorSpace);
  return l < 0.34 ? P.wood : frame;
}

/** 茶几或搁板上的立式相框：相框后仰，背面正中一根斜撑杆落在台面上 */
export function buildPhotoFrame(ctx: RoomContext, size: number, main = false) {
  const m = materials(ctx);
  const p = new Parts();
  const frameMaterial = main ? m.wood.clone() : m.wood;
  if (main) ctx.frameMaterial = frameMaterial;

  const boardW = size + 0.055;
  const boardH = size + 0.055;
  const tilt = 0.22;
  const lift = 0.008;

  // 相框板单独成组，绕底边后仰，底边仍贴着台面
  const panel = new Parts();
  panel.add(rounded(boardW, boardH, 0.032, 0.022), frameMaterial, [0, boardH / 2, 0]);
  panel.add(rounded(size + 0.018, size + 0.018, 0.015, 0.012), m.fabric, [0, boardH / 2, 0.023]);
  const material = main ? ctx.photoMaterial : new THREE.MeshBasicMaterial({ color: 0xffffff });
  const photo = new THREE.Mesh(new THREE.PlaneGeometry(size - 0.012, size - 0.012), material);
  photo.position.set(0, boardH / 2, 0.032);
  panel.mesh(photo);
  if (main) ctx.mainPhoto = photo;
  else ctx.albumPhotos.push(material as THREE.MeshBasicMaterial);
  const board = panel.finish();
  board.position.set(0, lift, 0);
  board.rotation.x = -tilt;

  // 背面正中一根斜撑杆，从板背偏上位置落到台面上
  const hingeY = boardH * 0.72;
  const hingeZ = -0.017;
  const hy = lift + hingeY * Math.cos(tilt) - hingeZ * Math.sin(tilt);
  const hz = -hingeY * Math.sin(tilt) + hingeZ * Math.cos(tilt);
  const footZ = -(0.09 + size * 0.25);
  p.beam(m.woodDark, [0, 0.004, footZ], [0, hy, hz], 0.009, 12);
  p.add(new THREE.CylinderGeometry(0.012, 0.012, 0.028, 12), m.brass, [0, hy, hz], [1, 1, 1], [0, 0, Math.PI / 2]);

  const group = p.finish();
  group.add(board);
  return group;
}

/** 茶几上的书 */
export function buildBook(ctx: RoomContext) {
  const m = materials(ctx);
  const p = new Parts();
  p.add(rounded(0.29, 0.038, 0.21, 0.012), m.leaf, [0, 0.019, 0]);
  p.add(rounded(0.275, 0.026, 0.198, 0.008), m.fabric, [0.006, 0.022, 0]);
  p.add(rounded(0.29, 0.008, 0.21, 0.004), m.leaf, [0, 0.042, 0]);
  return p.finish();
}

/** 一只带把手的杯子 */
export function buildCup(ctx: RoomContext) {
  const m = materials(ctx);
  const p = new Parts();
  const profile = [new THREE.Vector2(0, 0), new THREE.Vector2(0.042, 0), new THREE.Vector2(0.055, 0.015), new THREE.Vector2(0.058, 0.09), new THREE.Vector2(0.049, 0.095), new THREE.Vector2(0.044, 0.022), new THREE.Vector2(0, 0.018)];
  p.add(new THREE.LatheGeometry(profile, 36), m.fabric);
  p.add(new THREE.CylinderGeometry(0.046, 0.046, 0.003, 32), m.woodDark, [0, 0.074, 0]);
  p.add(new THREE.TorusGeometry(0.034, 0.008, 10, 28), m.fabric, [0.061, 0.055, 0], [0.75, 1, 1]);
  return p.finish();
}

/** 窗边小矮柜，只有收纳和花瓶，不带铜牌或年份 */
export function buildCabinet(ctx: RoomContext) {
  const m = materials(ctx);
  const p = new Parts();
  const { w, d, h } = S.cabinet;
  contact(p, m, w + 0.22, d + 0.2);
  for (const x of [-1, 1]) for (const z of [-1, 1]) p.add(new THREE.CylinderGeometry(0.022, 0.03, 0.11, 16), m.woodDark, [x * (w / 2 - 0.07), 0.055, z * (d / 2 - 0.06)]);
  p.add(rounded(w, h - 0.13, d, 0.045), m.wood, [0, 0.11 + (h - 0.13) / 2, 0]);
  p.add(rounded(w + 0.035, 0.055, d + 0.025, 0.025), m.wood, [0, h - 0.0275, 0]);
  p.add(rounded(w - 0.09, h - 0.22, 0.025, 0.025), m.woodDark, [0, 0.15 + (h - 0.22) / 2, d / 2 + 0.012]);
  p.add(rounded(w - 0.12, h - 0.25, 0.02, 0.022), m.wood, [0, 0.15 + (h - 0.22) / 2, d / 2 + 0.029]);
  p.add(new THREE.SphereGeometry(0.012, 16, 10), m.brass, [0.12, h - 0.18, d / 2 + 0.047]);
  return p.finish();
}

/** 圆润旋转体花瓶，替代原来十二边形的礼物花瓶 */
export function buildVase(ctx: RoomContext, small = false) {
  const m = materials(ctx);
  const p = new Parts();
  const k = small ? 0.76 : 1;
  const profile = [
    new THREE.Vector2(0, 0), new THREE.Vector2(0.055 * k, 0), new THREE.Vector2(0.078 * k, 0.025 * k),
    new THREE.Vector2(0.074 * k, 0.09 * k), new THREE.Vector2(0.045 * k, 0.145 * k),
    new THREE.Vector2(0.042 * k, 0.165 * k), new THREE.Vector2(0.033 * k, 0.165 * k),
    new THREE.Vector2(0.034 * k, 0.13 * k), new THREE.Vector2(0, 0.04 * k),
  ];
  p.add(new THREE.LatheGeometry(profile, 40), m.fabric);
  return p.finish();
}

/** 宠物窝 */
export function buildPetBed(ctx: RoomContext) {
  const m = materials(ctx);
  const p = new Parts();
  const r = S.bed.radius;
  contact(p, m, r * 2.35, r * 2.2);
  p.add(new THREE.SphereGeometry(1, 36, 20), m.fabricShade, [0, 0.12, 0], [r * 0.91, 0.13, r * 0.91]);
  p.add(new THREE.TorusGeometry(r * 0.76, r * 0.235, 20, 64), m.fabric, [0, 0.22, 0], [1, 1, 1], [Math.PI / 2, 0, 0]);
  p.add(new THREE.SphereGeometry(1, 36, 20), m.fabric, [0, 0.17, 0], [r * 0.66, 0.105, r * 0.66]);
  p.add(new THREE.TorusGeometry(r * 0.73, 0.012, 10, 64), m.fabricShade, [0, 0.293, 0], [1, 1, 1], [Math.PI / 2, 0, 0]);
  return p.finish();
}

/** 两只陶瓷碗 */
export function buildBowls(ctx: RoomContext) {
  const m = materials(ctx);
  const p = new Parts();
  contact(p, m, 0.68, 0.38);
  const profile = [new THREE.Vector2(0, 0), new THREE.Vector2(0.085, 0), new THREE.Vector2(0.125, 0.025), new THREE.Vector2(0.145, 0.085), new THREE.Vector2(0.143, 0.105), new THREE.Vector2(0.126, 0.108), new THREE.Vector2(0.112, 0.04), new THREE.Vector2(0, 0.025)];
  p.add(new THREE.LatheGeometry(profile, 36), m.accent, [-0.16, 0, 0]);
  p.add(new THREE.LatheGeometry(profile, 36), m.fabric, [0.16, 0, 0.035]);
  for (let i = 0; i < 5; i++) p.add(new THREE.SphereGeometry(0.014, 12, 8), m.woodDark, [-0.2 + (i % 3) * 0.035, 0.045, -0.025 + Math.floor(i / 3) * 0.04], [1, 0.65, 1]);
  return p.finish();
}

export function buildBall(ctx: RoomContext) {
  const m = materials(ctx);
  const p = new Parts();
  contact(p, m, 0.18, 0.16);
  p.add(new THREE.SphereGeometry(0.062, 28, 18), m.accent, [0, 0.062, 0]);
  p.add(new THREE.TorusGeometry(0.059, 0.007, 10, 36), m.fabric, [0, 0.062, 0], [1, 1, 1], [Math.PI / 2, 0.25, 0]);
  return p.finish();
}

/** 落地灯 */
export function buildFloorLamp(ctx: RoomContext) {
  const m = materials(ctx);
  const p = new Parts();
  const h = S.floorLamp.h;
  contact(p, m, 0.65, 0.58);
  p.add(new THREE.CylinderGeometry(0.23, 0.25, 0.045, 40), m.woodDark, [0, 0.0225, 0]);
  p.add(new THREE.CylinderGeometry(0.015, 0.019, h - 0.36, 20), m.brass, [0, (h - 0.36) / 2 + 0.04, 0]);
  m.shade.side = THREE.DoubleSide;
  p.add(new THREE.CylinderGeometry(0.18, 0.3, 0.37, 48, 1, true), m.shade, [0, h - 0.205, 0]);
  p.add(new THREE.TorusGeometry(0.3, 0.009, 10, 48), m.fabricShade, [0, h - 0.39, 0], [1, 1, 1], [Math.PI / 2, 0, 0]);
  p.add(new THREE.TorusGeometry(0.18, 0.007, 10, 48), m.fabricShade, [0, h - 0.02, 0], [1, 1, 1], [Math.PI / 2, 0, 0]);
  return p.finish();
}

/** 唯一的香薰蜡烛：直径 8 厘米、高 9 厘米的玻璃罐，短烛芯和小火苗 */
export function buildAromaCandle(ctx: RoomContext) {
  const m = materials(ctx);
  const p = new Parts();
  const wax = surface(0xffdfb0, 0.96);
  p.add(new THREE.CylinderGeometry(0.04, 0.038, 0.09, 36, 1, true), m.glass, [0, 0.045, 0]);
  p.add(new THREE.CylinderGeometry(0.038, 0.038, 0.008, 36), m.glass, [0, 0.004, 0]);
  p.add(new THREE.TorusGeometry(0.04, 0.0035, 8, 36), m.glass, [0, 0.09, 0], [1, 1, 1], [Math.PI / 2, 0, 0]);
  p.add(new THREE.CylinderGeometry(0.034, 0.034, 0.064, 36), wax, [0, 0.04, 0]);
  p.add(new THREE.CylinderGeometry(0.0014, 0.0014, 0.012, 8), m.woodDark, [0, 0.078, 0]);
  const group = p.finish();

  const flameMaterial = luminous(0xffb45a, 1.35);
  const flame = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), flameMaterial);
  flame.position.set(0, 0.098, 0);
  flame.scale.set(0.006, 0.014, 0.006);
  flame.renderOrder = 11;
  flame.visible = false;
  group.add(flame);
  ctx.candleFlame = flame;

  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(), color: 0xffbd72, transparent: true, opacity: 0.16,
    depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  glow.position.set(0, 0.065, 0);
  glow.scale.set(0.24, 0.24, 1);
  glow.renderOrder = 11;
  glow.visible = false;
  group.add(glow);
  ctx.candleGlow = glow;
  return group;
}

/** 沙发上方的木搁板，带两三本随意摆放的书 */
export function buildShelf(ctx: RoomContext, width: number) {
  const m = materials(ctx);
  const p = new Parts();
  p.add(rounded(width, 0.06, S.shelf.d, 0.025), m.wood);
  const colors = [m.fabric, m.accent, m.woodDark];
  for (let i = 0; i < 3; i++) {
    const h = 0.18 + i * 0.035;
    p.add(rounded(0.045, h, 0.14, 0.008), colors[i], [-width * 0.42 + i * 0.055, 0.03 + h / 2, 0]);
  }
  return p.finish();
}

/** 搁板上的垂吊植物 */
export function buildPlant(ctx: RoomContext) {
  const m = materials(ctx);
  const p = new Parts();
  const profile = [new THREE.Vector2(0, 0), new THREE.Vector2(0.07, 0), new THREE.Vector2(0.09, 0.025), new THREE.Vector2(0.105, 0.14), new THREE.Vector2(0.095, 0.15), new THREE.Vector2(0.08, 0.04), new THREE.Vector2(0, 0.035)];
  p.add(new THREE.LatheGeometry(profile, 32), m.fabric);
  p.add(new THREE.CylinderGeometry(0.08, 0.08, 0.01, 28), m.soil, [0, 0.135, 0]);
  for (let vine = 0; vine < 4; vine++) {
    const x = -0.075 + vine * 0.05;
    const length = 0.28 + (vine % 2) * 0.17;
    p.beam(m.leaf, [x, 0.15, 0.04], [x + 0.025, 0.15 - length, 0.11], 0.003, 8);
    for (let j = 0; j < 4; j++) {
      const y = 0.12 - j * length / 4;
      p.add(new THREE.SphereGeometry(1, 16, 10), m.leaf, [x + (j % 2 ? 0.025 : -0.02), y, 0.08 + j * 0.01], [0.035, 0.018, 0.055], [0.2, j * 0.8, j % 2 ? 0.4 : -0.4]);
    }
  }
  for (const x of [-0.07, 0.02, 0.08]) p.add(new THREE.SphereGeometry(1, 18, 12), m.leaf, [x, 0.23, 0], [0.045, 0.09, 0.025], [0.2, 0, x * 5]);
  return p.finish();
}

/** 窗边一小束气球，原点为系绳处；整组轻轻摆动 */
export function buildBalloons(ctx: RoomContext) {
  const m = materials(ctx);
  const group = new THREE.Group();
  const colors = [m.accent, m.fabric, m.wall];
  const positions: Vec3[] = [[-0.12, 1.25, 0], [0.08, 1.43, -0.02], [0.22, 1.18, 0.03]];
  positions.forEach((at, i) => {
    const p = new Parts();
    p.beam(m.woodDark, [0, S.cabinet.h, 0], [at[0], at[1] - 0.16, at[2]], 0.0025, 6);
    if (i === 0) p.add(new THREE.SphereGeometry(0.012, 12, 8), m.woodDark, [0, S.cabinet.h, 0]);
    p.add(new THREE.SphereGeometry(1, 28, 20), colors[i], at, [0.12, 0.16, 0.12]);
    p.add(new THREE.ConeGeometry(0.018, 0.035, 16), colors[i], [at[0], at[1] - 0.17, at[2]], [1, 1, 1], [0, 0, Math.PI]);
    group.add(p.finish());
  });
  return group;
}

/** 一组三只球形吊灯，只有中央一盏真实点光源 */
export function buildPendant(ctx: RoomContext) {
  const m = materials(ctx);
  const p = new Parts();
  for (const x of [-0.52, 0, 0.52]) {
    p.beam(m.brass, [x, S.room.h - 0.02, 0], [x, 2.57, 0], 0.009, 12);
    p.add(new THREE.SphereGeometry(0.18, 32, 20), m.shade, [x, 2.49, 0]);
    p.add(new THREE.TorusGeometry(0.181, 0.012, 10, 40), m.brass, [x, 2.49, 0], [1, 1, 1], [Math.PI / 2, 0, 0]);
    p.add(new THREE.CylinderGeometry(0.07, 0.09, 0.035, 24), m.brass, [x, 2.66, 0]);
  }
  return p.finish();
}

/** 按布置表摆放一件家具；开发素材或以后的 GLB 都复用同一位置 */
export function place(object: THREE.Group, placement: { at: [number, number, number]; yaw: number; scale: number }, floor: number) {
  object.position.set(placement.at[0], floor + placement.at[1], placement.at[2]);
  object.rotation.y = placement.yaw;
  object.scale.setScalar(placement.scale);
  return object;
}
