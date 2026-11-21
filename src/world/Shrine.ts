import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CONFIG } from '../config';
import type { Pet } from '../data/pets';
import { store, type OfferKind } from '../data/store';
import type { PhotoEntry } from './Batches';
import { candle, flowerStem, letter, snack, toy, vase } from './gifts';
import {
  buildBall,
  buildBowls,
  buildCabinet,
  buildFloorLamp,
  buildPetBed,
  buildPlant,
  buildRoomShell,
  buildRoundRug,
  buildShelf,
  buildWindow,
  place,
  type RoomContext,
} from './PetRoom';
import { canvasTexture, glowTexture, makeCanvas, textMesh } from './textures';
import type { Lamp, World } from './World';

const S = CONFIG.shrine;
const CAB = S.cabinet;
const LAYOUT = S.layout;

/** 布景的地面比大厅地面高一点，把大厅地砖挡在下面 */
const GROUND = 0.115;
/** root 的原点是镜头对准的房间中心；家具函数自己的原点都在各自落地处 */
const FLOOR = GROUND - S.y;
const BACK = -S.room.d / 2;
const TOP = CAB.h;
const PLAQUE_Y = CAB.h * 0.69;

/** 柜面上的礼物位置（相对矮柜中心）：后排蜡烛，前排小物，花瓶只占左右两角 */
const VASE_SPOTS: Array<[number, number]> = [[-0.57, -0.1], [0.57, -0.1]];
const FLOWERS_PER_VASE = 7;
const SPOTS: Record<'candle' | 'snack' | 'toy', Array<[number, number]>> = {
  candle: [[-0.27, -0.11], [-0.09, -0.12], [0.09, -0.12], [0.27, -0.11], [-0.18, -0.01], [0.18, -0.01]],
  snack: [[-0.57, 0.11], [-0.43, 0.14], [-0.29, 0.14], [-0.48, 0.01]],
  toy: [[0.32, 0.13], [0.47, 0.12], [0.6, 0.08], [0.48, -0.01]],
};
const LETTER_SPOT: [number, number] = [0, 0.12];

/** 礼物落下的高度和时长 */
const DROP_H = 0.28;
const DROP_TIME = 0.6;

/** 暗幕只负责挡住房间缝隙外的大厅；房间本身有完整的墙、地板和天花板 */
const VEIL = { h: 20, d: 14, inset: 0.6, half: 3, gap: 0.45 };
/** 背墙位于房间中心后方 d/2，暗幕背面仍留在大厅照片墙前 */
const OFFSET = VEIL.gap + S.room.d / 2 + 0.08;
const DUST_Y = [0.35, 2.65] as const;

export type ShrineHit = 'letter' | 'niche' | null;

/** 墙上的手写名字由宠物数据生成，画布最大 512，透明文字画在暗幕之后 */
function wallName(name: string) {
  const fontFamily = '"Bradley Hand", "Segoe Script", "Brush Script MT", cursive';
  const [measure, mctx] = makeCanvas(4, 4);
  void measure;
  let size = 78;
  mctx.font = `600 ${size}px ${fontFamily}`;
  const measured = mctx.measureText(name).width;
  if (measured > 470) size *= 470 / measured;
  const width = Math.min(512, Math.ceil(Math.min(measured, 470) + 36));
  const [canvas, ctx] = makeCanvas(width, 128);
  ctx.font = `600 ${size}px ${fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = new THREE.Color(S.palette.accent).getStyle();
  ctx.fillText(name, width / 2, 65);
  const material = new THREE.MeshBasicMaterial({ map: canvasTexture(canvas), transparent: true, depthWrite: false });
  const height = 0.25;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry((height * width) / 128, height), material);
  const fit = Math.min(1, 1.35 / ((height * width) / 128));
  mesh.scale.setScalar(fit);
  mesh.renderOrder = 11;
  return mesh;
}

function disposeText(mesh: THREE.Mesh | null) {
  if (!mesh) return;
  mesh.removeFromParent();
  const material = mesh.material as THREE.MeshBasicMaterial;
  material.map?.dispose();
  material.dispose();
  mesh.geometry.dispose();
}

/**
 * 单宠物视角：一间明亮、温暖的小屋。
 * 背墙是名字、照片和矮柜，左侧是窝与碗，右侧是落地灯和搁板，左墙有傍晚的窗。
 * Shrine 对外的入口、镜头中心、礼物和拾取接口保持不变；家具搭建与布置表在 PetRoom / config 里。
 */
export class Shrine {
  /** 当前打开的是哪张相框；没打开时是 null */
  entry: PhotoEntry | null = null;
  /** 镜头对准的那一点 */
  readonly center = new THREE.Vector3();

  /** 可点击的家具、照片和礼物 */
  private root = new THREE.Group();
  private cabinet: THREE.Group;
  private items = new THREE.Group();
  private letters = new THREE.Group();
  /** 房间壳体、窗和微尘：点这些地方算点在小屋外，可以返回 */
  private stage = new THREE.Group();
  private veil: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>;
  private photo: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private roomContext: RoomContext;
  private frame: THREE.MeshStandardMaterial;
  private plaqueText: THREE.Mesh | null = null;
  private nameText: THREE.Mesh | null = null;
  private lamp: Lamp;
  private windowLamp: Lamp;
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
    // 只生成一次环境贴图，并显式赋给本屋材质；绝不写 scene.environment
    const pmrem = new THREE.PMREMGenerator(world.renderer);
    const environment = new RoomEnvironment();
    const target = pmrem.fromScene(environment, 0.04);
    environment.dispose();
    pmrem.dispose();

    const photoMaterial = new THREE.MeshBasicMaterial({ map: world.photos.map, color: 0xf7f3ed });
    this.roomContext = { env: target.texture, photoMaterial, photos: [] };

    // 主照片：圆润外框 + 米白卡纸；外框颜色会换成照片墙上对应那一格
    const F = S.photo;
    const photoY = S.photoY - S.y;
    this.frame = new THREE.MeshStandardMaterial({
      color: S.palette.woodDark, roughness: 0.76, envMap: target.texture, envMapIntensity: S.environment.env,
    });
    const frameBack = new THREE.Mesh(new RoundedBoxGeometry(F + 0.12, F + 0.12, 0.055, 4, 0.035), this.frame);
    frameBack.position.set(0, photoY, BACK + 0.035);
    this.root.add(frameBack);
    const matBoard = new THREE.Mesh(
      new RoundedBoxGeometry(F + 0.055, F + 0.055, 0.02, 3, 0.018),
      new THREE.MeshStandardMaterial({ color: S.palette.fabric, roughness: 0.95, envMap: target.texture, envMapIntensity: S.environment.env }),
    );
    matBoard.position.set(0, photoY, BACK + 0.067);
    this.root.add(matBoard);
    this.photo = new THREE.Mesh(new THREE.PlaneGeometry(F, F), photoMaterial);
    this.photo.position.set(0, photoY, BACK + 0.079);
    this.root.add(this.photo);
    this.roomContext.photos.push(this.photo);

    // 每件家具独立搭建、按布置表落位；以后换 GLB 只替换同一个 Group 里的模型
    this.cabinet = place(buildCabinet(this.roomContext), LAYOUT.cabinet, FLOOR);
    this.root.add(this.cabinet);
    this.items.add(this.letters);
    this.cabinet.add(this.items);
    this.root.add(
      place(buildRoundRug(this.roomContext), LAYOUT.rug, FLOOR),
      place(buildPetBed(this.roomContext), LAYOUT.bed, FLOOR),
      place(buildBowls(this.roomContext), LAYOUT.bowls, FLOOR),
      place(buildBall(this.roomContext), LAYOUT.ball, FLOOR),
      place(buildFloorLamp(this.roomContext), LAYOUT.floorLamp, FLOOR),
      place(buildShelf(this.roomContext), LAYOUT.shelf, FLOOR),
      place(buildPlant(this.roomContext), LAYOUT.plant, FLOOR),
    );

    this.stage.add(buildRoomShell(this.roomContext));
    this.stage.children[0].position.y = FLOOR;
    this.stage.add(place(buildWindow(this.roomContext), LAYOUT.window, FLOOR));

    this.root.visible = false;
    world.scene.add(this.root);

    // 很少的暖色微尘，只让傍晚的光有一点空气感
    const pos = new Float32Array(S.stage.dust * 3);
    for (let i = 0; i < S.stage.dust; i++) {
      const x = (Math.random() - 0.5) * (S.room.w - 0.5);
      const z = BACK + 0.25 + Math.random() * (S.room.d - 0.65);
      this.motes.push({ x, z, phase: Math.random() * 6.28, speed: 0.6 + Math.random() * 0.8 });
      pos.set([x, DUST_Y[0] + Math.random() * (DUST_Y[1] - DUST_Y[0]) - S.y, z], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.dust = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        map: glowTexture(), color: S.stage.glow, size: 0.021, transparent: true, opacity: S.stage.dustGlow,
        depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
      }),
    );
    this.dust.renderOrder = 12.5;
    this.dust.frustumCulled = false;
    this.stage.add(this.dust);
    this.stage.visible = false;
    world.scene.add(this.stage);

    this.veil = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: S.stage.color, transparent: true, depthWrite: false, fog: false, side: THREE.BackSide }),
    );
    this.veil.renderOrder = 10;
    this.veil.visible = false;
    world.scene.add(this.veil);

    // 两盏灯都走 World 的灯位分配；不用真实阴影
    this.lamp = world.pointLight(1e6, 0, 0, 0, 6, 0xffd7a6);
    this.windowLamp = world.pointLight(1e6, 0, 0, 0, 6.5, 0xffc8a0);
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

  /** 布置成这只宠物的小屋。调用时画面应该是暗的，这里不做过渡 */
  open(entry: PhotoEntry) {
    this.entry = entry;
    this.center.copy(entry.center).addScaledVector(entry.normal, OFFSET);
    this.center.y = S.y;
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
    this.veil.position.y = 0.1 + VEIL.h / 2;
    this.veil.rotation.y = entry.rotY;
    this.veil.visible = true;

    const up = new THREE.Vector3(0, 1, 0);
    const lampPlace = LAYOUT.floorLamp;
    const lp = lampPlace.at;
    const lampOffset = new THREE.Vector3(0, S.floorLamp.h - 0.47, 0.12).multiplyScalar(lampPlace.scale).applyAxisAngle(up, lampPlace.yaw);
    this.root.localToWorld(this.lamp.pos.set(lp[0] + lampOffset.x, FLOOR + lp[1] + lampOffset.y, lp[2] + lampOffset.z));
    this.lamp.intensity = S.light;
    const windowPlace = LAYOUT.window;
    const wp = windowPlace.at;
    const windowOffset = new THREE.Vector3(0, S.window.y, 0.42).multiplyScalar(windowPlace.scale).applyAxisAngle(up, windowPlace.yaw);
    this.root.localToWorld(this.windowLamp.pos.set(wp[0] + windowOffset.x, FLOOR + wp[1] + windowOffset.y, wp[2] + windowOffset.z));
    this.windowLamp.intensity = S.windowLight;
    this.dust.visible = this.dusty;

    this.setPet(entry.pet);
    this.rebuild();
  }

  /** 收起来，同样在画面暗着的时候调用 */
  close() {
    this.entry = null;
    this.root.visible = false;
    this.stage.visible = false;
    this.veil.visible = false;
    this.drops.length = 0;
    this.lamp.pos.x = 1e6;
    this.windowLamp.pos.x = 1e6;
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

  /** 点击落在什么位置：那摞信、这间屋子里的家具 / 照片，还是空白墙面 / 外面 */
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

  private drift(dt: number) {
    if (!this.dust.visible) return;
    this.time += dt;
    const a = this.dust.geometry.attributes.position as THREE.BufferAttribute;
    this.motes.forEach((m, i) => {
      let y = a.getY(i) + S.stage.dustSpeed * m.speed * dt;
      if (y > DUST_Y[1] - S.y) y = DUST_Y[0] - S.y;
      a.setXYZ(i, m.x + Math.sin(this.time * 0.3 * m.speed + m.phase) * 0.06, y, m.z);
    });
    a.needsUpdate = true;
  }

  private setPet(pet: Pet) {
    const uv = this.world.photos.uvOf(pet);
    for (const photo of this.roomContext.photos) {
      const attr = photo.geometry.attributes.uv as THREE.BufferAttribute;
      const [u0, v0, u1, v1] = uv;
      attr.setXY(0, u0, v1);
      attr.setXY(1, u1, v1);
      attr.setXY(2, u0, v0);
      attr.setXY(3, u1, v0);
      attr.needsUpdate = true;
    }
    this.frame.color.setHex(this.world.slots.get(pet.id)?.frame ?? S.palette.woodDark).multiplyScalar(0.88);

    disposeText(this.plaqueText);
    disposeText(this.nameText);
    const years = [pet.birthDate?.slice(0, 4), pet.passedDate.slice(0, 4)].filter(Boolean).join(' – ');
    this.plaqueText = textMesh(`${pet.name} · ${years}`, { height: 0.048, color: '#2e2010', maxWidth: 0.46 });
    this.plaqueText.position.set(0, PLAQUE_Y, CAB.d / 2 + 0.064);
    this.plaqueText.renderOrder = 11;
    this.cabinet.add(this.plaqueText);

    this.nameText = wallName(pet.name);
    this.nameText.position.set(0, S.nameY - S.y, BACK + 0.07);
    this.root.add(this.nameText);
  }

  /** 按 store 里的数据把礼物重新摆到矮柜上；items 是柜子的子节点，会跟布置表一起移动 */
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

    const placeGift = (kind: 'candle' | 'snack' | 'toy', make: (v: number, i: number) => THREE.Object3D) => {
      gifts[kind].slice(0, caps[kind]).forEach((v, i) => {
        const [x, z] = SPOTS[kind][i % SPOTS[kind].length];
        const o = make(v, i);
        o.position.set(x, TOP, z);
        if (kind !== 'candle') o.rotation.y = i * 1.7 + 0.4;
        this.items.add(o);
        this.placed[kind].push(o);
      });
    };
    placeGift('candle', (v) => candle(v));
    placeGift('snack', snack);
    placeGift('toy', toy);

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
