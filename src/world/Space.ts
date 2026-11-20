import * as THREE from 'three';
import { CONFIG } from '../config';
import { albumOf, mulberry32, type Pet, type Shot } from '../data/pets';
import { store, type OfferKind } from '../data/store';
import { STR } from '../i18n';
import type { Area } from '../systems/Player';
import { candle, flowerStem, letter, snack, toy, vase } from './gifts';
import { bench } from './parts';
import { canvasTexture, drawPortrait, makeCanvas, pawTexture, textMesh } from './textures';
import type { Lamp, World } from './World';

const S = CONFIG.space;
const R = S.radius;
const DEG = Math.PI / 180;
/** 缺口两侧各占多少角度（从 +Z 方向量起） */
const GAP = ((360 - S.arc) / 2) * DEG;

// ---------- 石柱与石阶（院子里的局部坐标） ----------
const PILLAR = { w: 1.2, d: 0.45, h: 2.7, z: -(R - 0.75) };
/** 石柱正面 */
const FACE = PILLAR.z + PILLAR.d / 2;
/** 三级石阶：1 最低最靠外，3 最高、紧贴石柱 */
const TIER_D = 0.42;
const TIER_W = 2.6;
const TIER_TOP: Record<number, number> = { 1: 0.15, 2: 0.3, 3: 0.45 };
const tierZ = (tier: number) => FACE + (3 - tier + 0.5) * TIER_D;

/** 礼物摆在哪：[x, 第几级石阶] */
type Spot = [number, number];
const VASE_SPOTS: Spot[] = [[-0.92, 3], [0.92, 3]];
const FLOWERS_PER_VASE = 7;
const SPOTS: Record<'candle' | 'snack' | 'toy', Spot[]> = {
  candle: [[-0.6, 2], [0.6, 2], [-0.3, 3], [0.3, 3], [-1.1, 2], [1.1, 2]],
  snack: [[-0.4, 1], [-0.75, 1], [-1.08, 1], [-0.85, 2]],
  toy: [[0.4, 1], [0.75, 1], [1.08, 1], [0.85, 2]],
};
const LETTER_SPOT: Spot = [0, 1];

/** 新放下的礼物从多高落到石阶上、用多久 */
const DROP_H = 0.5;
const DROP_TIME = 0.6;

/** 石柱上各行字的高度 */
const TEXT = { name: 1.49, address: 1.347, meta: 1.245, dates: 1.135, message: 0.99, line: 0.125 };
const PHOTO = { y: 2.05, size: 0.78 };

/** 相册：弧墙内侧的几个相框，每个相框一张自己的小画布 */
const ALBUM = S.album;
const ALBUM_PX = 256;
interface AlbumSlot {
  group: THREE.Group;
  ctx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
}

/** 长椅：在入口内侧偏左，背对缺口，正对着石柱 */
const BENCH = { x: -1.9, z: R - 1.9 };
const SEAT_TOP = 0.485;

/**
 * 寄语太长时折成几行，每行不超过 max 个字符，各行尽量一样长。
 * 有空格的文字按单词折；没有空格的（中文、日文）按字折。
 */
function wrap(text: string, max = STR.style.pillarLine): string[] {
  if (text.length <= max) return [text];
  const spaced = /\s/.test(text);
  const words = spaced ? text.split(/\s+/) : [...text];
  const joiner = spaced ? ' ' : '';
  const target = text.length / Math.ceil(text.length / max);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? line + joiner + word : word;
    // 这一行已经够长，或者再加一个词就超了：另起一行
    if (line && (next.length > max || line.length >= target)) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * 一只宠物的专属纪念空间。
 * 一座露天的小院：正对入口是它的石柱（照片、名字、日期、寄语），柱脚三级石阶上摆着大家留下的礼物，
 * 四周一圈弧形石墙，入口内侧有张长椅。全馆共用这一座，open 时换成那只宠物的内容。
 */
export class Space {
  /** 小人能走动的范围，进来时交给 Player */
  readonly area: Area = { x: S.x, z: S.z, r: R, gap: GAP - 9 * DEG, out: S.out };
  /** 进来时站的位置：缺口内侧，面向石柱；镜头偏在身后一侧，不让小人挡住石柱 */
  readonly spawn = { x: S.x, z: S.z + R - 1.4, facing: 0, yaw: 0.34, pitch: -0.14 };
  /** 长椅上的座位：坐在哪、面朝哪、身体抬高多少、站起来时回到哪；yaw 是坐下后镜头转去的方向（能看见石柱） */
  readonly seat = {
    x: S.x + BENCH.x,
    z: S.z + BENCH.z - 0.02,
    facing: 0,
    yaw: -0.22,
    lift: SEAT_TOP - CONFIG.player.sitHip,
    exit: { x: S.x + BENCH.x, z: S.z + BENCH.z - 0.87 },
  };
  /** 由 main 注入：点了那摞信 / 长椅 */
  hooks = { letters: () => {}, bench: () => {} };
  pet: Pet | null = null;

  private root = new THREE.Group();
  private items = new THREE.Group();
  private texts = new THREE.Group();
  private photo: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private album: AlbumSlot[] = [];
  private letterProxy: THREE.Mesh;
  private candleLamp: Lamp;
  private placed: Record<OfferKind, THREE.Object3D[]> = { flower: [], candle: [], snack: [], toy: [], letter: [] };
  private drops: Array<{ o: THREE.Object3D; y: number; t: number }> = [];

  constructor(private world: World) {
    this.root.position.set(S.x, 0, S.z);
    world.scene.add(this.root);
    this.buildGround();
    this.buildWall();
    this.buildPillar();
    this.buildSurroundings();

    // 照片：和照片墙共用同一张图集
    this.photo = new THREE.Mesh(
      new THREE.PlaneGeometry(PHOTO.size, PHOTO.size),
      new THREE.MeshBasicMaterial({ map: world.photos.map, color: 0xe6e0da }),
    );
    this.photo.position.set(0, PHOTO.y, FACE + 0.062);
    this.root.add(this.photo, this.texts, this.items);
    this.buildAlbum();

    // 那摞信可以点开来读；没有信时把点击范围挪到地下
    this.letterProxy = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.36));
    this.letterProxy.visible = false;
    world.scene.add(this.letterProxy);
    world.interact(this.letterProxy, STR.tipLetters, () => this.hooks.letters());

    bench(world, S.x + BENCH.x, S.z + BENCH.z, Math.PI, 1.8, false);
    world.proxy(S.x + BENCH.x, 0.55, S.z + BENCH.z, 1.8, 1.1, 0.7, STR.tipBench, () => this.hooks.bench());

    // 石阶上有蜡烛时，多一点贴近地面的烛光
    this.candleLamp = world.pointLight(S.x, 0.95, S.z + FACE + 0.9, 0, 5, 0xffb070);

    world.updaters.push((dt) => this.update(dt));
  }

  /** 石柱正面前方的位置，小人站在这附近时会微微低头 */
  get front() {
    return { x: S.x, z: S.z + FACE + 3 * TIER_D };
  }

  /** 换成这只宠物的内容 */
  open(pet: Pet) {
    this.pet = pet;
    const [u0, v0, u1, v1] = this.world.photos.uvOf(pet);
    const uv = this.photo.geometry.attributes.uv as THREE.BufferAttribute;
    uv.setXY(0, u0, v1);
    uv.setXY(1, u1, v1);
    uv.setXY(2, u0, v0);
    uv.setXY(3, u1, v0);
    uv.needsUpdate = true;
    this.inscribe(pet);
    this.hang(pet);
    this.rebuild();
  }

  close() {
    this.pet = null;
    this.drops.length = 0;
  }

  /** 访客放下一件礼物（数据已写入 store）：重新摆放，并让新的那件轻轻落下 */
  drop(kind: OfferKind) {
    if (!this.pet) return;
    this.rebuild();
    const list = this.placed[kind];
    const o = list[list.length - 1];
    if (!o) return;
    this.drops.push({ o, y: o.position.y, t: 0 });
    o.position.y += DROP_H;
  }

  private update(dt: number) {
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.t = Math.min(1, d.t + dt / DROP_TIME);
      d.o.position.y = d.y + DROP_H * Math.pow(1 - d.t, 3);
      if (d.t >= 1) this.drops.splice(i, 1);
    }
  }

  // ---------- 搭建 ----------

  private buildGround() {
    const { scene } = this.world;
    // 主场景的草地铺不到这么远，这里自己铺一片；边缘藏在雾里
    const grass = new THREE.Mesh(
      new THREE.CircleGeometry(170, 48).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: CONFIG.colors.ground, roughness: 1 }),
    );
    grass.position.set(S.x, 0, S.z);
    grass.receiveShadow = true;
    scene.add(grass);

    const paving = new THREE.Mesh(
      new THREE.CylinderGeometry(R + S.wallT + 0.25, R + S.wallT + 0.25, 0.04, 56),
      new THREE.MeshStandardMaterial({ color: 0x77736d, roughness: 1 }),
    );
    paving.position.set(S.x, 0.02, S.z);
    paving.receiveShadow = true;
    scene.add(paving);

    // 地面正中嵌着一枚淡淡的爪印
    const paw = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 1.5).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: pawTexture(), color: 0xcfc6b8, transparent: true, opacity: 0.07, depthWrite: false }),
    );
    paw.position.set(S.x, 0.045, S.z + 0.5);
    scene.add(paw);
  }

  private buildWall() {
    const { kit } = this.world;
    const C = CONFIG.colors;
    const mid = R + S.wallT / 2;
    const n = 30;
    const from = GAP;
    const span = S.arc * DEG;
    const chord = 2 * mid * Math.sin(span / n / 2) + 0.05;
    for (let i = 0; i < n; i++) {
      const a = from + ((i + 0.5) / n) * span;
      const x = S.x + Math.sin(a) * mid;
      const z = S.z + Math.cos(a) * mid;
      kit.box(x, S.wallH / 2, z, chord, S.wallH, S.wallT, 0x9c978e, a);
      kit.box(x, S.wallH + 0.05, z, chord + 0.02, 0.1, S.wallT + 0.14, C.stone, a);
      kit.box(x, 0.12, z, chord + 0.02, 0.24, S.wallT + 0.1, C.stone, a);
    }

    // 缺口两侧的灯柱
    for (const a of [GAP, -GAP]) {
      const x = S.x + Math.sin(a) * mid;
      const z = S.z + Math.cos(a) * mid;
      kit.box(x, (S.wallH + 0.2) / 2, z, 0.52, S.wallH + 0.2, 0.52, 0x928d85, a);
      kit.box(x, S.wallH + 0.24, z, 0.62, 0.08, 0.62, C.stone, a);
      kit.glowBox(x, S.wallH + 0.44, z, 0.26, 0.32, 0.26, C.warm, 2.8, a);
      kit.cone(x, S.wallH + 0.6, z, 0.3, 0.2, 0x2b2b33, a);
      kit.pool(x, z, 3.6, C.warm, 0.16);
      this.world.pointLight(x, S.wallH + 0.4, z, S.gateLight, 10);
    }

    // 石柱两侧的壁灯
    for (const a of [150 * DEG, -150 * DEG]) {
      const x = S.x + Math.sin(a) * (R - 0.02);
      const z = S.z + Math.cos(a) * (R - 0.02);
      const nx = -Math.sin(a);
      const nz = -Math.cos(a);
      kit.box(x + nx * 0.06, 1.95, z + nz * 0.06, 0.14, 0.06, 0.14, 0x2b2b33, a);
      kit.glowBall(x + nx * 0.14, 2.07, z + nz * 0.14, 0.085, C.warm, 2.2);
      // 光源离墙远一点，免得把墙面照得发白
      this.world.pointLight(x + nx * 1.5, 2.3, z + nz * 1.5, S.light, 12);
    }
  }

  private buildPillar() {
    const { kit } = this.world;
    const C = CONFIG.colors;
    const x = S.x;
    const z = (lz: number) => S.z + lz;

    // 石阶
    for (const tier of [1, 2, 3]) {
      const top = TIER_TOP[tier];
      kit.box(x, top / 2, z(tierZ(tier)), TIER_W, top, TIER_D, tier === 2 ? 0x86827b : 0x938f87);
    }
    // 基座、柱身、柱顶
    kit.box(x, 0.225, z(PILLAR.z), PILLAR.w + 0.3, 0.45, PILLAR.d + 0.14, C.stone);
    kit.box(x, PILLAR.h / 2, z(PILLAR.z), PILLAR.w, PILLAR.h, PILLAR.d, 0x8f8a82);
    kit.box(x, PILLAR.h + 0.06, z(PILLAR.z), PILLAR.w + 0.16, 0.12, PILLAR.d + 0.12, C.stone);
    // 相框
    kit.box(x, PHOTO.y, z(FACE + 0.02), PHOTO.size + 0.14, PHOTO.size + 0.14, 0.05, 0xb08d57);
    kit.box(x, PHOTO.y, z(FACE + 0.046), PHOTO.size + 0.05, PHOTO.size + 0.05, 0.02, 0x3d2a1e);

    // 石柱和石阶整体挡住小人
    const zMin = PILLAR.z - PILLAR.d / 2 - 0.1;
    const zMax = FACE + 3 * TIER_D;
    this.world.collide(x, z((zMin + zMax) / 2), TIER_W, zMax - zMin);
  }

  /** 弧墙内侧的相框：先都做好藏着，open 时按这只宠物有几张照片显示几个 */
  private buildAlbum() {
    const size = ALBUM.size;
    const frameGeo = new THREE.BoxGeometry(size + 0.1, size + 0.1, 0.04);
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x3d2a1e, roughness: 0.8 });
    const lampGeo = new THREE.BoxGeometry(size * 0.6, 0.016, 0.03);
    const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(CONFIG.colors.warm).multiplyScalar(2.2) });
    const photoGeo = new THREE.PlaneGeometry(size, size);
    for (const deg of ALBUM.angles) {
      const a = deg * DEG;
      const [canvas, ctx] = makeCanvas(ALBUM_PX, ALBUM_PX);
      const texture = canvasTexture(canvas);
      const group = new THREE.Group();
      // 贴着墙的内侧，正面朝向院子中心
      group.position.set(Math.sin(a) * (R - 0.03), ALBUM.y, Math.cos(a) * (R - 0.03));
      group.rotation.y = a + Math.PI;
      const photo = new THREE.Mesh(photoGeo, new THREE.MeshBasicMaterial({ map: texture, color: 0xe6e0da }));
      photo.position.z = 0.024;
      const lamp = new THREE.Mesh(lampGeo, lampMat);
      lamp.position.set(0, size / 2 + 0.09, 0.05);
      group.add(new THREE.Mesh(frameGeo, frameMat), photo, lamp);
      group.visible = false;
      this.root.add(group);
      this.album.push({ group, ctx, texture });
    }
  }

  /** 把这只宠物相册里的照片挂到墙上；没有那么多张的相框收起来 */
  private hang(pet: Pet) {
    const shots = albumOf(pet);
    this.album.forEach((slot, i) => {
      const shot: Shot | undefined = shots[i];
      slot.group.visible = !!shot;
      if (!shot) return;
      drawPortrait(slot.ctx, 0, 0, ALBUM_PX, pet, shot.variant);
      slot.texture.needsUpdate = true;
      if (!shot.url) return;
      // 真实照片加载完成后裁成正方形盖上去；这期间换了别的宠物就不画了
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        if (this.pet !== pet) return;
        const s = Math.min(img.width, img.height);
        slot.ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, ALBUM_PX, ALBUM_PX);
        slot.texture.needsUpdate = true;
      };
      img.src = shot.url;
    });
  }

  /** 墙外的树、灌木、花草，和缺口外的一小段石头路 */
  private buildSurroundings() {
    const { kit } = this.world;
    const rnd = mulberry32(31);
    const rand = (a: number, b: number) => a + rnd() * (b - a);
    const greens = [0x2f6b4a, 0x3a7a52, 0x27603f, 0x4a8a58];
    const at = (a: number, r: number): [number, number] => [S.x + Math.sin(a) * r, S.z + Math.cos(a) * r];

    for (let k = 0; k < 22; k++) {
      // 缺口正前方留空，其余方向疏疏地种一圈
      const front = k >= 18;
      const a = front ? (k % 2 ? 1 : -1) * rand(28, 50) * DEG : rand(55, 305) * DEG;
      const [x, z] = at(a, front ? rand(R + 6, R + 15) : rand(R + 2.6, R + 15));
      const s = rand(0.9, 1.7);
      const g = greens[Math.floor(rnd() * greens.length)];
      kit.cyl(x, 0, z, 0.2 * s, 1.6 * s, 0x5b4332);
      kit.cone(x, 1.2 * s, z, 1.7 * s, 2.4 * s, g, rand(0, 6));
      kit.cone(x, 2.5 * s, z, 1.35 * s, 2.1 * s, g, rand(0, 6));
      kit.cone(x, 3.7 * s, z, 0.95 * s, 1.8 * s, g, rand(0, 6));
    }
    for (let k = 0; k < 14; k++) {
      const [x, z] = at(rand(40, 320) * DEG, R + S.wallT + rand(0.7, 3));
      kit.ball(x, 0.25, z, rand(0.4, 0.8), greens[k % 4], 0.75, rand(0, 6));
    }
    const flowers = [0xfff2a8, 0xffb7c5, 0xffffff, 0xc9b6ff, 0xffd08a];
    for (let k = 0; k < 160; k++) {
      const [x, z] = at(rand(0, 360) * DEG, R + S.wallT + rand(0.5, 10));
      // 石头路上不长花
      if (z > S.z && Math.abs(x - S.x) < 1.3) continue;
      if (rnd() < 0.65) {
        kit.cone(x, 0, z, rand(0.04, 0.07), rand(0.18, 0.36), rnd() < 0.5 ? 0x4c8a55 : 0x5fa064, rand(0, 6));
      } else {
        kit.cone(x, 0, z, 0.02, 0.16, 0x4c8a55);
        kit.ball(x, 0.18, z, rand(0.04, 0.065), flowers[Math.floor(rnd() * flowers.length)]);
      }
    }
    for (let d = R + S.wallT + 0.6; d < R + 9; d += 0.62) {
      for (let k = 0; k < 3; k++) {
        const r = rand(0.26, 0.4);
        const g = Math.round(rand(0.42, 0.6) * 255);
        kit.cyl(S.x + (k - 1) * 0.66 + rand(-0.12, 0.12), 0, S.z + d + rand(-0.12, 0.12), r, 0.05, (g << 16) | (g << 8) | g);
      }
    }
  }

  // ---------- 换宠物时重做的部分 ----------

  /** 石柱上的字：名字、它在照片墙上的地址、种类、生卒日期、主人寄语 */
  private inscribe(pet: Pet) {
    for (const o of [...this.texts.children] as THREE.Mesh[]) {
      const m = o.material as THREE.MeshBasicMaterial;
      m.map?.dispose();
      m.dispose();
      o.geometry.dispose();
    }
    this.texts.clear();
    const line = (text: string, y: number, height: number, color: string) => {
      // 太长的一行整体缩小，不超出柱面
      const m = textMesh(text, { height, color, maxWidth: PILLAR.w - 0.1 });
      m.position.set(0, y, FACE + 0.006);
      this.texts.add(m);
    };
    // 浅色石面上刻深色的字
    line(pet.name, TEXT.name, 0.21, '#33261a');
    line(STR.address(pet.floor, pet.section, pet.cell), TEXT.address, 0.075, '#6b5a48');
    line([STR.species[pet.species], pet.breed].filter(Boolean).join(' · '), TEXT.meta, 0.09, '#5a4a3a');
    line(`${pet.birthDate ?? '?'} — ${pet.passedDate}`, TEXT.dates, 0.09, '#5a4a3a');
    wrap(pet.message).forEach((t, i) => line(t, TEXT.message - i * TEXT.line, 0.105, '#3d2e20'));
  }

  /** 按 store 里的数据把礼物重新摆到石阶上 */
  private rebuild() {
    const pet = this.pet;
    if (!pet) return;
    this.drops.length = 0;
    this.items.clear();
    for (const k of Object.keys(this.placed) as OfferKind[]) this.placed[k] = [];

    const gifts = store.gifts(pet);
    const caps = S.caps;
    const put = (o: THREE.Object3D, [x, tier]: Spot, dz = 0) => {
      o.position.set(x, TIER_TOP[tier], tierZ(tier) + dz);
      o.scale.setScalar(S.giftScale);
      this.items.add(o);
      return o;
    };

    // 花插在花瓶里，一只花瓶插满后再放第二只
    const flowers = gifts.flower.slice(0, caps.flower);
    for (let vi = 0; vi * FLOWERS_PER_VASE < flowers.length; vi++) {
      const pot = put(vase(), VASE_SPOTS[vi % VASE_SPOTS.length]);
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
    }

    const place = (kind: 'candle' | 'snack' | 'toy', make: (v: number, i: number) => THREE.Object3D) => {
      gifts[kind].slice(0, caps[kind]).forEach((v, i) => {
        const o = put(make(v, i), SPOTS[kind][i % SPOTS[kind].length], kind === 'candle' ? -0.04 : 0.02);
        if (kind !== 'candle') o.rotation.y = i * 1.7 + 0.4;
        this.placed[kind].push(o);
      });
    };
    place('candle', (v) => candle(v));
    place('snack', snack);
    place('toy', toy);
    this.candleLamp.intensity = this.placed.candle.length ? 2.2 + 0.5 * this.placed.candle.length : 0;

    // 信叠成一小摞
    const n = Math.min(store.counts(pet).letter, caps.letter);
    for (let i = 0; i < n; i++) {
      const o = put(letter(), LETTER_SPOT, (i % 3) * -0.01);
      o.position.x += i % 2 ? 0.02 : -0.018;
      o.position.y += i * 0.0068 * S.giftScale;
      o.rotation.y = ((i * 0.37) % 1 - 0.5) * 0.5;
      this.placed.letter.push(o);
    }
    this.letterProxy.position.set(S.x + LETTER_SPOT[0], n ? TIER_TOP[1] + 0.08 : -50, S.z + tierZ(1));
  }
}
