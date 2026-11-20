import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Pet } from '../data/pets';
import { store, type OfferKind } from '../data/store';
import type { PhotoEntry } from './Batches';
import { candle, flowerStem, letter, snack, toy, vase } from './gifts';
import { canvasTexture, glowTexture, makeCanvas, textMesh } from './textures';
import type { Lamp, World } from './World';

const S = CONFIG.shrine;
const TB = S.table;

/** 布景的地面（暗幕盒子的底面）比大厅地面高一点，把大厅的地砖挡在下面 */
const GROUND = 0.1;
/**
 * 下面的坐标都以镜头对准的那一点为原点（离地 S.y），+z 朝外（离开墙）。
 * FLOOR 是布景的地面，TOP 是桌面，WALL 是背后那面墙。
 */
const FLOOR = GROUND - S.y;
const TOP = FLOOR + TB.h;
const WALL = -TB.d / 2 - 0.012;
/** 桌面板的厚度、桌面下那圈围板的高度 */
const SLAB = 0.04;
const APRON = 0.1;
/** 名牌在围板正面的高度 */
const PLAQUE_Y = TOP - SLAB - APRON / 2;

/** 桌面上各类礼物的摆放位置 [x, z]：花瓶在左后，台灯在右后，蜡烛在照片正下方，零食和玩具在前排两侧，信在正中 */
const VASE_SPOTS: Array<[number, number]> = [[-0.58, -0.1], [-0.4, -0.13]];
const FLOWERS_PER_VASE = 7;
const SPOTS: Record<'candle' | 'snack' | 'toy', Array<[number, number]>> = {
  candle: [[-0.15, -0.13], [0.15, -0.13], [-0.25, -0.06], [0.25, -0.06], [-0.05, -0.15], [0.06, -0.15]],
  snack: [[-0.2, 0.12], [-0.34, 0.14], [-0.48, 0.11], [-0.62, 0.13]],
  toy: [[0.2, 0.12], [0.33, 0.14], [0.46, 0.11], [0.6, 0.13]],
};
const LETTER_SPOT: [number, number] = [0, 0.12];
const LAMP_SPOT: [number, number] = [0.57, -0.09];

/**
 * 配色：木头、地毯、黄铜。这个角落离自己的灯很近，颜色都要比看上去的压暗一些，
 * 否则会亮到发白、泛出辉光；金属用哑光的，亮面离镜头近会反出刺眼的光斑。
 */
const WOOD = 0x8a6748;
const WOOD_DARK = 0x4a3526;
const RUG = 0x5e3a30;
const RUG_EDGE = 0x7a5a45;
const BRASS = 0x9a7c4e;
/** 搁板上它留下的东西：毯子和毯子上的一道条纹、碗、球、项圈 */
const KEEP = { blanket: 0x7d6a58, stripe: 0x94523f, bowl: 0x8c9296, ball: 0x9a5a3c, collar: 0x5c3a2c };

/** 一张木纹：顺着长边的细条纹，深浅略有起伏，不需要图片文件 */
function woodTexture() {
  const [c, ctx] = makeCanvas(256, 256);
  ctx.fillStyle = '#f0e6da';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 90; i++) {
    const y = (i * 53) % 256;
    const shade = 150 + ((i * 37) % 70);
    ctx.strokeStyle = `rgba(${shade},${shade - 22},${shade - 44},${0.1 + ((i * 13) % 10) / 60})`;
    ctx.lineWidth = 1 + (i % 3);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(80, y + ((i % 5) - 2) * 2, 170, y - ((i % 7) - 3) * 2, 256, y + ((i % 3) - 1) * 2);
    ctx.stroke();
  }
  return canvasTexture(c);
}

/** 礼物落到桌面上的高度和时长 */
const DROP_H = 0.28;
const DROP_TIME = 0.6;

/**
 * 暗幕盒子：高、进深；两侧离大厅的墙缩进多少（把相邻那面墙和墙上的东西也挡在外面）；
 * half 是桌子中心离盒子两头至少多远：靠近墙角的格子打开时往里挪，墙上那团光到盒子的侧面之前已经淡没了；
 * gap 是盒子背面（这个角落的墙）离照片墙多远，再近会露出照片墙墙根的东西
 */
const VEIL = { h: 20, d: 14, inset: 0.6, half: 3, gap: 0.45 };
/** 镜头对准的那一点离照片墙多远：桌子正好靠着布景的墙 */
const OFFSET = VEIL.gap - WALL;

/** 微尘飘的高度范围（离地） */
const DUST_Y = [0.5, 2.9] as const;

export type ShrineHit = 'letter' | 'niche' | null;

/**
 * 单宠物视角：它自己的一个小角落。
 * 照片墙上的相框只是入口，点开以后画面暗一下再亮起来，眼前是家里靠墙的一张木头边桌：
 * 墙上挂着它的照片（和照片墙上同一种相框），桌沿一块小铜牌写着名字和年份，
 * 桌上一盏小台灯，大家留下的花、蜡烛、零食、玩具和信都摆在桌面上。
 * 周围是一面暖色的暗墙和一块地毯，大厅被一只暗色的大盒子挡在外面。
 * 全馆只有这一个角落，打开哪只宠物就换成它的照片和礼物。
 */
export class Shrine {
  /** 当前打开的是哪张相框；没打开时是 null */
  entry: PhotoEntry | null = null;
  /** 镜头对准的那一点 */
  readonly center = new THREE.Vector3();

  /** 桌子、照片、台灯、地毯和桌上的东西：点到它们都算点在这个角落里 */
  private root = new THREE.Group();
  private items = new THREE.Group();
  private letters = new THREE.Group();
  /** 布景里点不到的部分：墙根的踢脚线、两团暖光、微尘 */
  private stage = new THREE.Group();
  private veil: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>;
  private photo: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private frame: THREE.MeshStandardMaterial;
  private plaqueText: THREE.Mesh | null = null;
  private lamp: Lamp;
  private placed: Record<OfferKind, THREE.Object3D[]> = { flower: [], candle: [], snack: [], toy: [], letter: [] };
  private drops: Array<{ o: THREE.Object3D; y: number; t: number }> = [];
  private dust: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  private motes: Array<{ x: number; z: number; phase: number; speed: number }> = [];
  private time = 0;
  /** 高画质才有微尘 */
  dusty = true;
  private room: { axis: 'x' | 'z'; lo: number; hi: number } = { axis: 'x', lo: 0, hi: 0 };
  private ray = new THREE.Raycaster();
  private ndc = new THREE.Vector2();

  constructor(private world: World) {
    const C = CONFIG.colors;
    const G = S.stage;
    const grain = woodTexture();
    const wood = new THREE.MeshStandardMaterial({ map: grain, color: WOOD, roughness: 0.8 });
    const dark = new THREE.MeshStandardMaterial({ map: grain, color: WOOD_DARK, roughness: 0.85 });
    const brass = new THREE.MeshStandardMaterial({ color: BRASS, metalness: 0.4, roughness: 0.6 });
    const box = new THREE.BoxGeometry(1, 1, 1);
    const add = (m: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, to: THREE.Object3D = this.root) => {
      const mesh = new THREE.Mesh(box, m);
      mesh.position.set(x, y, z);
      mesh.scale.set(sx, sy, sz);
      to.add(mesh);
      return mesh;
    };

    // 桌子：一块探出一点的桌面、下面一圈围板、四条腿、靠下的一层搁板
    const legH = TOP - SLAB - FLOOR;
    add(wood, 0, TOP - SLAB / 2, 0, TB.w + 0.06, SLAB, TB.d + 0.04);
    add(dark, 0, TOP - SLAB - APRON / 2, 0, TB.w - 0.06, APRON, TB.d - 0.06);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) add(wood, sx * (TB.w / 2 - 0.045), FLOOR + legH / 2, sz * (TB.d / 2 - 0.045), 0.055, legH, 0.055);
    }
    add(wood, 0, FLOOR + 0.2, 0, TB.w - 0.1, 0.025, TB.d - 0.1);
    // 名牌：围板正面的一块小铜牌
    add(brass, 0, PLAQUE_Y, TB.d / 2 - 0.03 + 0.004, 0.5, 0.07, 0.008);

    // 地毯：一块椭圆，边上一圈浅一点的颜色
    const disc = new THREE.CylinderGeometry(1, 1, 1, 48);
    const rug = (color: number, rx: number, rz: number, y: number) => {
      const mesh = new THREE.Mesh(disc, new THREE.MeshStandardMaterial({ color, roughness: 1 }));
      mesh.scale.set(rx, 0.01, rz);
      mesh.position.set(0, FLOOR + y, 0.28);
      this.root.add(mesh);
    };
    rug(RUG_EDGE, 1.25, 0.78, 0.005);
    rug(RUG, 1.17, 0.7, 0.008);

    // 墙上的相框和照片：和照片墙上是同一种（框的颜色打开时换成它那一格的）
    const F = S.photo;
    const photoY = S.photoY - S.y;
    this.frame = new THREE.MeshStandardMaterial({ color: WOOD_DARK, roughness: 0.8 });
    add(this.frame, 0, photoY, WALL + 0.02, F + 0.06, F + 0.06, 0.04);
    this.photo = new THREE.Mesh(new THREE.PlaneGeometry(F, F), new THREE.MeshBasicMaterial({ map: world.photos.map, color: 0xe6e0da }));
    this.photo.position.set(0, photoY, WALL + 0.045);
    this.root.add(this.photo);

    // 台灯：黄铜的底座和细杆，一只亮着的灯罩
    const [lx, lz] = LAMP_SPOT;
    const part = (geo: THREE.BufferGeometry, m: THREE.Material, y: number) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(lx, TOP + y, lz);
      this.root.add(mesh);
    };
    part(new THREE.CylinderGeometry(0.05, 0.06, 0.02, 20), brass, 0.01);
    part(new THREE.CylinderGeometry(0.007, 0.007, 0.2, 8), brass, 0.12);
    part(
      new THREE.CylinderGeometry(0.055, 0.1, 0.13, 24, 1, true),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(C.warm).multiplyScalar(1.15), side: THREE.DoubleSide }),
      0.27,
    );

    // 搁板上它留下的几样东西：一条叠好的毯子、一只碗、一个球、一条项圈。每只宠物都一样，不分种类
    const SHELF = FLOOR + 0.2125;
    const cloth = (color: number) => new THREE.MeshStandardMaterial({ color, roughness: 1 });
    const blanket = cloth(KEEP.blanket);
    add(blanket, -0.4, SHELF + 0.022, 0.02, 0.34, 0.044, 0.26);
    add(blanket, -0.4, SHELF + 0.062, 0.03, 0.32, 0.036, 0.22);
    add(cloth(KEEP.stripe), -0.4, SHELF + 0.062, 0.03, 0.06, 0.038, 0.222);
    const keep = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, SHELF + y, z);
      this.root.add(mesh);
      return mesh;
    };
    const bowl = new THREE.MeshStandardMaterial({ color: KEEP.bowl, roughness: 0.7, side: THREE.DoubleSide });
    keep(new THREE.CylinderGeometry(0.085, 0.065, 0.05, 24, 1, true), bowl, 0.08, 0.025, 0.04);
    keep(new THREE.CylinderGeometry(0.066, 0.066, 0.008, 24), bowl, 0.08, 0.006, 0.04);
    keep(new THREE.SphereGeometry(0.045, 20, 14), cloth(KEEP.ball), 0.3, 0.045, 0.1);
    keep(new THREE.TorusGeometry(0.06, 0.009, 8, 28), cloth(KEEP.collar), 0.48, 0.009, -0.02).rotation.x = Math.PI / 2;
    keep(new THREE.CylinderGeometry(0.014, 0.014, 0.004, 14), brass, 0.48, 0.004, 0.055);

    this.items.add(this.letters);
    this.root.add(this.items);
    this.root.visible = false;
    world.scene.add(this.root);

    // 墙根的一条踢脚线，让墙和地面分得开
    add(dark, 0, FLOOR + 0.05, WALL + 0.012, 30, 0.1, 0.024, this.stage);
    // 墙上、地上各一团暖光
    const glow = (k: number, w: number, h: number) => {
      const m = new THREE.MeshBasicMaterial({
        map: glowTexture(), color: G.glow, transparent: true, opacity: k, depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
      mesh.renderOrder = 10.5;
      this.stage.add(mesh);
      return mesh;
    };
    glow(G.wallGlow, 9, 7).position.set(0.15, photoY - 0.1, WALL + 0.004);
    const pool = glow(G.floorGlow, 7, 5);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(0, FLOOR + 0.003, 0.7);

    // 微尘：很少的几粒，在灯光里慢慢往上飘
    const pos = new Float32Array(G.dust * 3);
    for (let i = 0; i < G.dust; i++) {
      const x = (Math.random() - 0.5) * 3.4;
      const z = 0.05 + Math.random() * 1.7;
      this.motes.push({ x, z, phase: Math.random() * 6.28, speed: 0.6 + Math.random() * 0.8 });
      pos.set([x, DUST_Y[0] + Math.random() * (DUST_Y[1] - DUST_Y[0]) - S.y, z], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.dust = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        map: glowTexture(), color: G.glow, size: 0.024, transparent: true, opacity: G.dustGlow, depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
      }),
    );
    this.dust.renderOrder = 12.5;
    this.dust.frustumCulled = false;
    this.stage.add(this.dust);
    this.stage.visible = false;
    world.scene.add(this.stage);

    // 暗幕：一只从里面看的暗色大盒子，把这个角落和镜头罩在里面——背面是这里的墙，底面是这里的地面，
    // 盒子外面的大厅都被它挡住，镜头左右转的时候也看不到别的
    this.veil = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: G.color, transparent: true, depthWrite: false, fog: false, side: THREE.BackSide }),
    );
    this.veil.renderOrder = 10;
    this.veil.visible = false;
    world.scene.add(this.veil);

    // 这个角落自己的灯，同样走灯位分配机制；不用时挪到很远的地方
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
    return this.entry !== null;
  }

  /** 布置成这只宠物的角落。调用时画面应该是暗的（见 main 里的 transition），这里不做过渡 */
  open(entry: PhotoEntry) {
    this.entry = entry;
    this.center.copy(entry.center).addScaledVector(entry.normal, OFFSET);
    this.center.y = S.y;
    // 这面墙是沿 x 还是沿 z 走的；暗幕盒子沿墙铺到大厅两头，这个角落不超出它
    const H = CONFIG.hall;
    const axis = Math.abs(entry.normal.z) > 0.5 ? 'x' : 'z';
    const [lo, hi] = axis === 'x' ? [-H.w / 2 + VEIL.inset, H.w / 2 - VEIL.inset] : [-H.d + VEIL.inset, -VEIL.inset];
    this.center[axis] = THREE.MathUtils.clamp(this.center[axis], lo + VEIL.half, hi - VEIL.half);
    this.room = { axis, lo, hi };

    for (const g of [this.root, this.stage]) {
      g.position.copy(this.center);
      g.rotation.y = entry.rotY;
      g.visible = true;
      g.updateMatrixWorld(true);
    }
    this.veil.scale.set(hi - lo, VEIL.h, VEIL.d);
    this.veil.position.copy(entry.center).addScaledVector(entry.normal, VEIL.gap + VEIL.d / 2);
    this.veil.position[axis] = (lo + hi) / 2;
    this.veil.position.y = GROUND + VEIL.h / 2;
    this.veil.rotation.y = entry.rotY;
    this.veil.visible = true;
    // 灯光从台灯那一侧的上前方照过来，离桌面远一点，木头才不会被照得发白
    this.root.localToWorld(this.lamp.pos.set(0.3, TOP + 0.8, 0.65));
    this.lamp.intensity = S.light;
    this.dust.visible = this.dusty;

    this.setPet(entry.pet);
    this.rebuild();
  }

  /** 收起来。同样在画面暗着的时候调用 */
  close() {
    this.entry = null;
    this.root.visible = false;
    this.stage.visible = false;
    this.veil.visible = false;
    this.drops.length = 0;
    this.lamp.pos.x = 1e6;
  }

  /** 访客放下一件礼物（数据已写入 store）：重新摆放，并让新的那件轻轻落下 */
  drop(kind: OfferKind) {
    if (!this.entry) return;
    this.rebuild();
    const list = this.placed[kind];
    const o = list[list.length - 1];
    if (!o) return;
    this.drops.push({ o, y: o.position.y, t: 0 });
    o.position.y += DROP_H;
  }

  /** 点击落在什么位置：那摞信、这个角落里的东西（桌子、照片、台灯、地毯），还是外面 */
  pick(clientX: number, clientY: number, camera: THREE.Camera): ShrineHit {
    if (!this.root.visible) return null;
    this.ndc.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
    this.ray.setFromCamera(this.ndc, camera);
    const hit = this.ray.intersectObject(this.root, true)[0];
    if (!hit) return null;
    for (let o: THREE.Object3D | null = hit.object; o; o = o.parent) if (o === this.letters) return 'letter';
    return 'niche';
  }

  private update(dt: number) {
    if (!this.root.visible) return;
    this.dust.visible = this.dusty;
    this.drift(dt);
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.t = Math.min(1, d.t + dt / DROP_TIME);
      d.o.position.y = d.y + DROP_H * Math.pow(1 - d.t, 3);
      if (d.t >= 1) this.drops.splice(i, 1);
    }
  }

  /** 微尘往上飘，左右轻轻晃；飘出顶就从底下重新来 */
  private drift(dt: number) {
    if (!this.dust.visible) return;
    this.time += dt;
    const a = this.dust.geometry.attributes.position as THREE.BufferAttribute;
    this.motes.forEach((m, i) => {
      let y = a.getY(i) + S.stage.dustSpeed * m.speed * dt;
      if (y > DUST_Y[1] - S.y) y = DUST_Y[0] - S.y;
      a.setXYZ(i, m.x + Math.sin(this.time * 0.3 * m.speed + m.phase) * 0.08, y, m.z);
    });
    a.needsUpdate = true;
  }

  private setPet(pet: Pet) {
    const [u0, v0, u1, v1] = this.world.photos.uvOf(pet);
    const uv = this.photo.geometry.attributes.uv as THREE.BufferAttribute;
    uv.setXY(0, u0, v1);
    uv.setXY(1, u1, v1);
    uv.setXY(2, u0, v0);
    uv.setXY(3, u1, v0);
    uv.needsUpdate = true;
    // 相框用照片墙上它那一格的颜色，压暗一些（这里灯近，浅色的框会发白）
    this.frame.color.setHex(this.world.slots.get(pet.id)?.frame ?? WOOD_DARK).multiplyScalar(0.6);

    if (this.plaqueText) {
      this.root.remove(this.plaqueText);
      const m = this.plaqueText.material as THREE.MeshBasicMaterial;
      m.map?.dispose();
      m.dispose();
      this.plaqueText.geometry.dispose();
    }
    const years = [pet.birthDate?.slice(0, 4), pet.passedDate.slice(0, 4)].filter(Boolean).join(' – ');
    this.plaqueText = textMesh(`${pet.name} · ${years}`, { height: 0.055, color: '#2e2010', maxWidth: 0.46 });
    this.plaqueText.position.set(0, PLAQUE_Y, TB.d / 2 - 0.03 + 0.0085);
    // 画在暗幕之后，否则会被暗幕盖住
    this.plaqueText.renderOrder = 11;
    this.root.add(this.plaqueText);
  }

  /** 按 store 里的数据把礼物重新摆到桌面上 */
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
      pot.position.set(vx, TOP, vz);
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
        o.position.set(x, TOP, z);
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
      o.position.set(LETTER_SPOT[0] + (i % 2 ? 0.012 : -0.01), TOP + i * 0.0068, LETTER_SPOT[1] - (i % 3) * 0.006);
      o.rotation.y = ((i * 0.37) % 1 - 0.5) * 0.5;
      this.letters.add(o);
      this.placed.letter.push(o);
    }
  }
}
