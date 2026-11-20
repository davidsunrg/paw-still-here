import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CONFIG } from '../config';
import type { Pet } from '../data/pets';
import { store, type OfferKind } from '../data/store';
import type { PhotoEntry } from './Batches';
import { candle, flowerStem, letter, snack, toy, vase } from './gifts';
import { canvasTexture, glowTexture, makeCanvas, textMesh } from './textures';
import type { Lamp, World } from './World';

const S = CONFIG.shrine;
/** 台面高度（小龛中心为原点） */
const FLOOR = -S.h / 2 + 0.026;
const BACK = -S.d / 2;

/** 台面上各类礼物的摆放位置 [x, z]：相框在后方正中，礼物围着它摆开 */
const VASE_SPOTS: Array<[number, number]> = [[-0.53, -0.1], [0.53, -0.1]];
const FLOWERS_PER_VASE = 7;
const SPOTS: Record<'candle' | 'snack' | 'toy', Array<[number, number]>> = {
  candle: [[-0.37, -0.03], [0.37, -0.03], [-0.29, 0.07], [0.29, 0.07], [-0.45, 0.07], [0.45, 0.07]],
  snack: [[-0.2, 0.22], [-0.34, 0.23], [-0.48, 0.21], [-0.62, 0.22]],
  toy: [[0.2, 0.22], [0.33, 0.23], [0.46, 0.21], [0.59, 0.22]],
};
const LETTER_SPOT: [number, number] = [0, 0.215];

/** 柜身石板的厚度；内壁比石板的外沿收进去多少（台面、顶板、侧板的内表面都在这个位置） */
const T = S.wall;
const LIP = 0.018;
/**
 * 配色：米白的石材、内壁稍深一点的暖色（浅色的蜡烛、花瓶、信放在前面才看得清）、香槟金。
 * 小龛离自己的灯很近，颜色都要比看上去的压暗一些，否则会亮到发白、泛出辉光。
 */
const STONE = 0xa8a297;
const INNER = 0x6a5846;
const CLOTH = 0x857663;
const GOLD = 0xa88a5e;
const IVORY = 0xa9a08f;

/** 一张很淡的石纹：只有一点点明暗起伏，不需要图片文件 */
function stoneTexture() {
  const [c, ctx] = makeCanvas(256, 256);
  const px = ctx.createImageData(256, 256);
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      const cloud = Math.sin(x * 0.034) * Math.cos(y * 0.046) + Math.sin(x * 0.078 + y * 0.054) * 0.4;
      const grain = Math.sin(x * 71.37 + y * 19.17) * 1.2;
      const v = 244 + cloud * 5 + grain;
      px.data.set([v, v - 1, v - 3, 255], (y * 256 + x) * 4);
    }
  }
  ctx.putImageData(px, 0, 0);
  return canvasTexture(c);
}

/** 名牌在底座正面的高度 */
const PLAQUE_Y = -S.h / 2 + LIP - (T + 0.085) / 2;

/** 玻璃：整块淡淡的一层，上面两道斜着的反光 */
function glassTexture() {
  const [c, ctx] = makeCanvas(128, 128);
  ctx.fillStyle = 'rgba(255,255,255,0.13)';
  ctx.fillRect(0, 0, 128, 128);
  const streak = (at: number, width: number, alpha: number) => {
    const g = ctx.createLinearGradient(0, 128, 128, 0);
    g.addColorStop(Math.max(0, at - width), 'rgba(255,255,255,0)');
    g.addColorStop(at, `rgba(255,255,255,${alpha})`);
    g.addColorStop(Math.min(1, at + width), 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  };
  streak(0.38, 0.1, 0.55);
  streak(0.56, 0.04, 0.4);
  return canvasTexture(c);
}

/** 礼物落到台面上的高度和时长 */
const DROP_H = 0.28;
const DROP_TIME = 0.6;

/**
 * 暗幕盒子：高、进深；两侧离大厅的墙缩进多少（把相邻那面墙和墙上的东西也挡在外面）；
 * half 是小龛连打开的门在内的半宽，靠近墙角的格子展开时往里挪到放得下的位置
 */
const VEIL = { h: 20, d: 14, inset: 0.35, half: 1.65, gap: 0.45 };

/** 台座：台面的高度（小龛底座的底面落在这里）、它站着的地面（暗幕盒子的底面） */
const PED_TOP = S.y - (S.h / 2 - LIP + T) - 0.085;
const PED_FLOOR = 0.1;
const PED_STONE = 0x4f4238;
/** 微尘飘的高度范围 */
const DUST_Y = [0.5, 2.9] as const;

export type ShrineHit = 'letter' | 'niche' | null;

/**
 * 单宠物视角里的小龛。
 * 照片墙上的一格太小放不下东西，所以点开某只宠物时，从它的相框位置「长」出一个更宽更深的小龛，
 * 停在相框前方；同时用一块暗幕把后面的照片墙压暗，让视线集中在这一格上。
 * 样子是一只米白石材的小展示柜：上下各有两层收边、嵌着细金线，底座正面是名牌，
 * 前面两扇金属框的玻璃门，展开时向两边打开，收回时合上。
 * 全馆只有这一个小龛，换一只宠物时换掉里面的照片和礼物。
 */
export class Shrine {
  /** 当前打开的是哪张相框；收回动画播完后变回 null */
  entry: PhotoEntry | null = null;
  /** 小龛完全展开后的中心位置（镜头对准这里） */
  readonly center = new THREE.Vector3();

  private root = new THREE.Group();
  private items = new THREE.Group();
  private letters = new THREE.Group();
  private veil: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>;
  private photo: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  /** 两扇玻璃门：各自绕着柜身前沿的一根竖轴转 */
  private doors = new THREE.Group();
  private leaves: Array<{ hinge: THREE.Group; sign: number }> = [];
  /** 金属：它的光泽来自一张环境反射贴图（见 reflect） */
  private shiny: THREE.MeshPhysicalMaterial[] = [];
  private gold: THREE.MeshPhysicalMaterial;
  private plaqueText: THREE.Mesh | null = null;
  private lamp: Lamp;
  private placed: Record<OfferKind, THREE.Object3D[]> = { flower: [], candle: [], snack: [], toy: [], letter: [] };
  private drops: Array<{ o: THREE.Object3D; y: number; t: number }> = [];
  /** 布景：台座、墙上和地上的两团暖光、空气里的微尘。不跟着小龛从墙上长出来，待在它最后落脚的地方 */
  private stage = new THREE.Group();
  private pedestal = new THREE.Group();
  private glows: Array<{ m: THREE.MeshBasicMaterial; k: number }> = [];
  private dust: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  private motes: Array<{ x: number; z: number; phase: number; speed: number }> = [];
  private time = 0;
  /** 高画质才有微尘 */
  dusty = true;
  private from = new THREE.Vector3();
  private room: { axis: 'x' | 'z'; lo: number; hi: number } = { axis: 'x', lo: 0, hi: 0 };
  private k = 0;
  private opening = false;
  private ray = new THREE.Raycaster();
  private ndc = new THREE.Vector2();

  constructor(private world: World) {
    const C = CONFIG.colors;
    const stone = new THREE.MeshStandardMaterial({ map: stoneTexture(), color: STONE, roughness: 0.7 });
    const inner = new THREE.MeshStandardMaterial({ color: INNER, roughness: 0.95 });
    this.gold = new THREE.MeshPhysicalMaterial({ color: GOLD, metalness: 0.7, roughness: 0.42, clearcoat: 0.3, clearcoatRoughness: 0.3, envMapIntensity: 0.35 });
    this.shiny.push(this.gold);
    const { gold } = this;
    const box = new THREE.BoxGeometry(1, 1, 1);
    const add = (m: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, to: THREE.Object3D = this.root) => {
      const mesh = new THREE.Mesh(box, m);
      mesh.position.set(x, y, z);
      mesh.scale.set(sx, sy, sz);
      to.add(mesh);
      return mesh;
    };
    /** 柜身外沿：半宽、顶面和底面的高度、前沿 */
    const OW = S.w + 2 * (T - LIP);
    const top = S.h / 2 - LIP + T;
    const bottom = -top;
    const front = S.d / 2;

    // 柜身：背板（里面一层是内壁的颜色）、两侧、顶板、台面
    add(stone, 0, 0, BACK - 0.035, OW, S.h + 2 * (T - LIP), 0.04);
    add(inner, 0, 0, BACK - 0.008, S.w, S.h, 0.016);
    for (const sx of [-1, 1]) add(stone, sx * (S.w / 2 - LIP + T / 2), 0, 0, T, S.h, S.d);
    add(stone, 0, top - T / 2, 0, OW, T, S.d);
    add(stone, 0, bottom + T / 2, 0, OW, T, S.d);
    // 顶上两层收边，一层比一层宽，中间嵌一条金线
    add(stone, 0, top + 0.0175, 0.02, OW + 0.06, 0.035, S.d + 0.04);
    add(stone, 0, top + 0.0525, 0.035, OW + 0.12, 0.035, S.d + 0.07);
    add(gold, 0, top + 0.0175, front + 0.041, OW + 0.03, 0.006, 0.006);
    // 底座两层，同样嵌一条金线；正面凸出一块，名牌嵌在上面
    add(stone, 0, bottom - 0.02, 0.025, OW + 0.06, 0.04, S.d + 0.05);
    add(stone, 0, bottom - 0.0625, 0.045, OW + 0.14, 0.045, S.d + 0.09);
    add(gold, 0, bottom - 0.02, front + 0.051, OW + 0.03, 0.006, 0.006);
    add(stone, 0, bottom + (T - 0.085) / 2, front + 0.05, 0.7, T + 0.085, 0.1);
    add(gold, 0, PLAQUE_Y, front + 0.103, 0.6, 0.1, 0.008);
    // 台面上铺的一块衬布
    add(new THREE.MeshStandardMaterial({ color: CLOTH, roughness: 1 }), 0, FLOOR - 0.004, 0.01, S.w - 0.1, 0.008, S.d - 0.06);
    // 顶部的灯条
    add(
      new THREE.MeshBasicMaterial({ color: new THREE.Color(C.warm).multiplyScalar(1.7) }),
      0, S.h / 2 - LIP - 0.008, S.d / 2 - 0.07, S.w * 0.7, 0.014, 0.03,
    );

    // 相框（金色的框、象牙色的衬边）和照片
    add(gold, 0, 0.06, BACK + 0.02, 0.62, 0.62, 0.04);
    add(new THREE.MeshStandardMaterial({ color: IVORY, roughness: 0.9 }), 0, 0.06, BACK + 0.036, 0.57, 0.57, 0.012);
    this.photo = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 0.5),
      new THREE.MeshBasicMaterial({ map: world.photos.map, color: 0xe6e0da }),
    );
    this.photo.position.set(0, 0.06, BACK + 0.044);
    this.root.add(this.photo);
    this.buildDoors(add);
    this.dust = this.buildStage(add, stone, OW);

    this.items.add(this.letters);
    this.root.add(this.items);
    this.root.visible = false;
    world.scene.add(this.root);

    // 暗幕：一只从里面看的暗色大盒子，把小龛和镜头罩在里面——背面贴着照片墙，底面贴着地面，
    // 盒子外面的墙、地面、天花板都被它挡住，镜头左右转的时候也看不到别的
    this.veil = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: S.stage.color, transparent: true, opacity: 0, depthWrite: false, fog: false, side: THREE.BackSide }),
    );
    this.veil.renderOrder = 10;
    this.veil.visible = false;
    world.scene.add(this.veil);

    // 小龛自己的灯，同样走灯位分配机制；不用时挪到很远的地方
    this.lamp = world.pointLight(1e6, 0, 0, 0, 6, 0xffd9a8);

    world.updaters.push((dt) => this.update(dt));
  }

  /** 镜头能不能到 (x, z)：得待在暗幕盒子里面，否则会看到盒子外面的大厅 */
  inside(x: number, z: number, margin = 0.3) {
    const e = this.entry;
    if (!e) return true;
    const { axis, lo, hi } = this.room;
    const along = axis === 'x' ? x : z;
    const out = (x - e.center.x) * e.normal.x + (z - e.center.z) * e.normal.z;
    return along > lo + margin && along < hi - margin && out > VEIL.gap + margin && out < VEIL.gap + VEIL.d - margin;
  }

  get isOpen() {
    return this.opening;
  }

  open(entry: PhotoEntry) {
    this.entry = entry;
    this.opening = true;
    this.k = 0;
    this.from.copy(entry.center);
    this.center.copy(entry.center).addScaledVector(entry.normal, S.offset);
    this.center.y = S.y;
    // 这面墙是沿 x 还是沿 z 走的；暗幕盒子沿墙铺到大厅两头，小龛不超出它
    const H = CONFIG.hall;
    const axis = Math.abs(entry.normal.z) > 0.5 ? 'x' : 'z';
    const [lo, hi] = axis === 'x' ? [-H.w / 2 + VEIL.inset, H.w / 2 - VEIL.inset] : [-H.d + VEIL.inset, -VEIL.inset];
    this.center[axis] = THREE.MathUtils.clamp(this.center[axis], lo + VEIL.half, hi - VEIL.half);
    this.room = { axis, lo, hi };

    this.root.rotation.y = entry.rotY;
    this.root.visible = true;
    this.veil.scale.set(hi - lo, VEIL.h, VEIL.d);
    this.veil.position.copy(entry.center).addScaledVector(entry.normal, VEIL.gap + VEIL.d / 2);
    this.veil.position[axis] = (lo + hi) / 2;
    this.veil.position.y = PED_FLOOR + VEIL.h / 2;
    this.veil.rotation.y = entry.rotY;
    this.veil.visible = true;
    this.stage.position.set(this.center.x, 0, this.center.z);
    this.stage.rotation.y = entry.rotY;
    this.stage.visible = true;
    this.lamp.pos.copy(this.center).addScaledVector(entry.normal, S.d / 2 + 0.45);
    this.lamp.pos.y += 0.25;

    this.setPet(entry.pet);
    this.rebuild();
    this.apply();
  }

  close() {
    this.opening = false;
  }

  /** 访客放入一件礼物（数据已写入 store）：重新摆放，并让新的那件轻轻落下 */
  drop(kind: OfferKind) {
    if (!this.entry) return;
    this.rebuild();
    const list = this.placed[kind];
    const o = list[list.length - 1];
    if (!o) return;
    this.drops.push({ o, y: o.position.y, t: 0 });
    o.position.y += DROP_H;
  }

  /** 点击落在小龛的什么位置：信、小龛本身，还是外面。打开的玻璃门不算，隔着它点到的是后面的东西 */
  pick(clientX: number, clientY: number, camera: THREE.Camera): ShrineHit {
    if (!this.root.visible) return null;
    this.ndc.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
    this.ray.setFromCamera(this.ndc, camera);
    const under = (o: THREE.Object3D | null, g: THREE.Object3D) => {
      for (; o; o = o.parent) if (o === g) return true;
      return false;
    };
    const hit = this.ray.intersectObject(this.root, true).find((h) => !under(h.object, this.doors));
    if (!hit) return null;
    return under(hit.object, this.letters) ? 'letter' : 'niche';
  }

  /**
   * 给金属一张环境反射贴图（一间程序生成的小房间），它才有光泽。
   * 只用在小龛的这几种材质上，不影响场景里别的东西的光照。启动时调用一次。
   */
  reflect(renderer: THREE.WebGLRenderer) {
    const room = new RoomEnvironment();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = pmrem.fromScene(room, 0.04, 0.1, 100).texture;
    room.dispose();
    pmrem.dispose();
    for (const m of this.shiny) {
      m.envMap = env;
      m.needsUpdate = true;
    }
  }

  private update(dt: number) {
    if (!this.root.visible) return;
    this.k = THREE.MathUtils.clamp(this.k + ((this.opening ? 1 : -1) * dt) / S.time, 0, 1);
    this.apply();
    this.drift(dt);

    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.t = Math.min(1, d.t + dt / DROP_TIME);
      d.o.position.y = d.y + DROP_H * Math.pow(1 - d.t, 3);
      if (d.t >= 1) this.drops.splice(i, 1);
    }

    if (!this.opening && this.k === 0) {
      this.root.visible = false;
      this.veil.visible = false;
      this.stage.visible = false;
      this.entry = null;
      this.lamp.pos.x = 1e6;
    }
  }

  private apply() {
    const e = this.k * this.k * (3 - 2 * this.k);
    this.root.position.lerpVectors(this.from, this.center, e);
    this.root.scale.setScalar(THREE.MathUtils.lerp(S.startScale, 1, e));
    this.veil.material.opacity = S.veil * e;
    // 台座从地面升起来，小龛落上去；光和微尘跟着暗幕一起亮起来
    this.pedestal.position.y = -(1 - e) * (PED_TOP + 0.1);
    for (const g of this.glows) g.m.opacity = g.k * e;
    this.dust.material.opacity = S.stage.dustGlow * e;
    this.dust.visible = this.dusty;
    this.lamp.intensity = S.light * e;
    // 门在展开的后半段才打开，收回时先合上
    const D = S.doors;
    const o = THREE.MathUtils.smoothstep(this.k, D.from, 1);
    for (const { hinge, sign } of this.leaves) hinge.rotation.y = sign * D.open * o;
  }

  /**
   * 布景。坐标：原点在小龛中心正下方的地面上，+z 朝外（离开墙）。
   * 暗幕的背面就在小龛背后几厘米，看起来小龛是靠着一面暖色的墙、摆在一张石台上。
   */
  private buildStage(
    add: (m: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, to?: THREE.Object3D) => THREE.Mesh,
    stone: THREE.Material,
    OW: number,
  ) {
    const G = S.stage;
    // 台座：上面一块探出来的台面，中间的台身，下面一圈脚线；台面下嵌一条金线
    const p = this.pedestal;
    // 台座用比柜身深的石色，把亮的地方让给小龛
    stone = new THREE.MeshStandardMaterial({ map: stoneTexture(), color: PED_STONE, roughness: 0.85, emissive: 0x1c130d });
    const shaft = PED_TOP - PED_FLOOR - 0.05 - 0.08;
    add(stone, 0, PED_TOP - 0.025, 0.045, OW + 0.32, 0.05, S.d + 0.26, p);
    add(stone, 0, PED_FLOOR + 0.08 + shaft / 2, 0.045, OW + 0.12, shaft, S.d + 0.08, p);
    add(stone, 0, PED_FLOOR + 0.04, 0.045, OW + 0.3, 0.08, S.d + 0.26, p);
    add(this.gold, 0, PED_TOP - 0.075, 0.045 + (S.d + 0.08) / 2 + 0.003, OW + 0.06, 0.006, 0.006, p);
    this.stage.add(p);

    // 墙上、地上各一团暖光
    const glow = (k: number, w: number, h: number) => {
      const m = new THREE.MeshBasicMaterial({
        map: glowTexture(), color: G.glow, transparent: true, opacity: 0, depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
      mesh.renderOrder = 10.5;
      this.glows.push({ m, k });
      this.stage.add(mesh);
      return mesh;
    };
    const wallZ = -S.offset + VEIL.gap + 0.02;
    glow(G.wallGlow, 9, 7).position.set(0, S.y + 0.25, wallZ);
    const pool = glow(G.floorGlow, 7, 5);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(0, PED_FLOOR + 0.01, 0.7);

    // 微尘：很少的几粒，在小龛前面的光里慢慢往上飘
    const pos = new Float32Array(G.dust * 3);
    for (let i = 0; i < G.dust; i++) {
      const x = (Math.random() - 0.5) * 3.4;
      const z = 0.05 + Math.random() * 1.7;
      this.motes.push({ x, z, phase: Math.random() * 6.28, speed: 0.6 + Math.random() * 0.8 });
      pos.set([x, DUST_Y[0] + Math.random() * (DUST_Y[1] - DUST_Y[0]), z], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const dust = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        map: glowTexture(), color: G.glow, size: 0.024, transparent: true, opacity: 0, depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
      }),
    );
    dust.renderOrder = 12.5;
    dust.frustumCulled = false;
    this.stage.add(dust);
    this.stage.visible = false;
    this.world.scene.add(this.stage);
    return dust;
  }

  /** 微尘往上飘，左右轻轻晃；飘出顶就从底下重新来 */
  private drift(dt: number) {
    if (!this.dust.visible) return;
    this.time += dt;
    const a = this.dust.geometry.attributes.position as THREE.BufferAttribute;
    this.motes.forEach((m, i) => {
      let y = a.getY(i) + S.stage.dustSpeed * m.speed * dt;
      if (y > DUST_Y[1]) y = DUST_Y[0];
      a.setXYZ(i, m.x + Math.sin(this.time * 0.3 * m.speed + m.phase) * 0.08, y, m.z);
    });
    a.needsUpdate = true;
  }

  /** 两扇玻璃门：金属的细框、一块几乎透明的玻璃、靠中缝的一颗小拉手 */
  private buildDoors(add: (m: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, to?: THREE.Object3D) => THREE.Mesh) {
    // 门框用哑一点的金色：门开得很大时正对着小龛的灯，亮面的金属会反出一道刺眼的光
    const gold = new THREE.MeshStandardMaterial({ color: GOLD, metalness: 0.35, roughness: 0.75 });
    gold.color.multiplyScalar(0.8);
    // 玻璃不受灯光影响（否则小龛的灯会在上面照出一团刺眼的高光）：一层很淡的底色，加两道斜着的反光
    const glass = new THREE.MeshBasicMaterial({ map: glassTexture(), color: 0xfff3dd, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide });
    /** 门轴在柜身前沿的两个角上；每扇门从门轴伸到中缝 */
    const axisX = S.w / 2 - LIP + T - 0.012;
    const leafW = axisX - 0.004;
    const leafH = S.h - 2 * LIP + 0.03;
    const bar = 0.026;
    const knob = new THREE.SphereGeometry(0.012, 12, 8);
    // 拉手和门轴离镜头近，用不反光的材质，免得亮成一个白点
    const brass = new THREE.MeshStandardMaterial({ color: GOLD, metalness: 0.3, roughness: 0.6 });
    const pane = new THREE.PlaneGeometry(leafW - bar, leafH - bar);
    for (const sign of [-1, 1]) {
      const hinge = new THREE.Group();
      hinge.position.set(sign * axisX, 0, S.d / 2 + 0.014);
      const cx = (-sign * leafW) / 2;
      for (const sy of [-1, 1]) add(gold, cx, (sy * (leafH - bar)) / 2, 0, leafW, bar, 0.016, hinge);
      for (const sx of [-1, 1]) add(gold, cx + (sx * (leafW - bar)) / 2, 0, 0, bar, leafH, 0.016, hinge);
      const g = new THREE.Mesh(pane, glass);
      g.position.x = cx;
      // 画在暗幕之后，否则会被暗幕盖住
      g.renderOrder = 12;
      const k = new THREE.Mesh(knob, brass);
      k.position.set(-sign * (leafW - bar / 2), 0, 0.016);
      hinge.add(g, k);
      // 门轴上下各一段小圆柱
      for (const y of [-0.3, 0.3]) {
        const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.07, 10), brass);
        pin.position.y = y;
        hinge.add(pin);
      }
      this.doors.add(hinge);
      this.leaves.push({ hinge, sign });
    }
    this.root.add(this.doors);
  }

  private setPet(pet: Pet) {
    const [u0, v0, u1, v1] = this.world.photos.uvOf(pet);
    const uv = this.photo.geometry.attributes.uv as THREE.BufferAttribute;
    uv.setXY(0, u0, v1);
    uv.setXY(1, u1, v1);
    uv.setXY(2, u0, v0);
    uv.setXY(3, u1, v0);
    uv.needsUpdate = true;

    if (this.plaqueText) {
      this.root.remove(this.plaqueText);
      const m = this.plaqueText.material as THREE.MeshBasicMaterial;
      m.map?.dispose();
      m.dispose();
      this.plaqueText.geometry.dispose();
    }
    const years = [pet.birthDate?.slice(0, 4), pet.passedDate.slice(0, 4)].filter(Boolean).join(' – ');
    this.plaqueText = textMesh(`${pet.name} · ${years}`, { height: 0.075, color: '#3d2a14', maxWidth: 0.56 });
    this.plaqueText.position.set(0, PLAQUE_Y, S.d / 2 + 0.109);
    // 画在暗幕之后，否则会被暗幕盖住
    this.plaqueText.renderOrder = 11;
    this.root.add(this.plaqueText);
  }

  /** 按 store 里的数据把礼物重新摆到台面上 */
  private rebuild() {
    const pet = this.entry?.pet;
    if (!pet) return;
    this.drops.length = 0;
    this.letters.clear();
    this.items.clear();
    this.items.add(this.letters);
    for (const k of Object.keys(this.placed) as OfferKind[]) this.placed[k] = [];

    const gifts = store.gifts(pet);
    const caps = S.caps;

    // 花插在花瓶里，一只花瓶插满后再放第二只
    const flowers = gifts.flower.slice(0, caps.flower);
    for (let vi = 0; vi * FLOWERS_PER_VASE < flowers.length; vi++) {
      const [vx, vz] = VASE_SPOTS[vi % VASE_SPOTS.length];
      const pot = vase();
      pot.position.set(vx, FLOOR, vz);
      flowers.slice(vi * FLOWERS_PER_VASE, (vi + 1) * FLOWERS_PER_VASE).forEach((v, j) => {
        const stem = flowerStem(v, 0.21 + 0.03 * (j % 4));
        stem.rotation.z = j === 0 ? 0 : 0.17 + 0.07 * (j % 3);
        const holder = new THREE.Group();
        holder.add(stem);
        holder.position.y = 0.03;
        holder.rotation.y = j * 2.4 + vi;
        pot.add(holder);
        this.placed.flower.push(holder);
      });
      this.items.add(pot);
    }

    const place = (kind: 'candle' | 'snack' | 'toy', make: (v: number, i: number) => THREE.Object3D) => {
      gifts[kind].slice(0, caps[kind]).forEach((v, i) => {
        const [x, z] = SPOTS[kind][i % SPOTS[kind].length];
        const o = make(v, i);
        o.position.set(x, FLOOR, z);
        if (kind !== 'candle') o.rotation.y = i * 1.7 + 0.4;
        this.items.add(o);
        this.placed[kind].push(o);
      });
    };
    place('candle', (v) => candle(v));
    place('snack', snack);
    place('toy', toy);

    // 信叠成一小摞
    const n = Math.min(store.counts(pet).letter, caps.letter);
    for (let i = 0; i < n; i++) {
      const o = letter();
      o.position.set(LETTER_SPOT[0] + (i % 2 ? 0.012 : -0.01), FLOOR + i * 0.0068, LETTER_SPOT[1] - (i % 3) * 0.006);
      o.rotation.y = ((i * 0.37) % 1 - 0.5) * 0.5;
      this.letters.add(o);
      this.placed.letter.push(o);
    }
  }
}
