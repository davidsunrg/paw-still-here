import * as THREE from 'three';
import { slotToPlacement } from '@paw/shared';
import { CONFIG } from '../config';
import { PETS, replaceSlotPet, type Pet } from '../data/pets';
import { STR } from '../i18n';
import { LabelBatch, PhotoBatch, type PhotoEntry } from './Batches';
import { buildBonfire, type Bonfire } from './Bonfire';
import { buildGateEntrance } from './Cave';
import { CaveRide } from './CaveRide';
import { buildCinema, type Cinema } from './Cinema';
import { buildLanternTerrace } from './LanternTerrace';
import { buildGallery, type Gallery } from './Gallery';
import { tickFlames } from './gifts';
import { buildHall } from './Hall';
import { Kit } from './Kit';
import { buildOutdoor } from './Outdoor';
import { buildRiver, type River } from './River';
import { MOON_DIR, Sky } from './Sky';
import { Shrine } from './Shrine';
import type { Tree } from './Tree';

export interface Collider {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** 高到足以挡住视线（墙） */
  tall: boolean;
}

export interface Interactable {
  object: THREE.Object3D;
  label: string;
  onClick: () => void;
}

/** 一只宠物在照片墙上的那一格 */
export interface SlotInfo {
  /** 它的相框 */
  entry: PhotoEntry;
  /** 相框下面小石台的台面中心 */
  ledge: THREE.Vector3;
  /** 相框的颜色 */
  frame: number;
}

/** 一个可以坐下的位置（沙发、长椅、树桩凳），模拟访客会走过来坐一会儿 */
export interface Seat {
  x: number;
  z: number;
  /** 坐面的高度 */
  top: number;
  /** 坐下后面朝的方向（和小人朝向的约定一致） */
  facing: number;
  /** 走到这里再坐下 */
  approach: { x: number; z: number };
  /** 座位排得很密时（影厅）：这一排前面的窄道通到哪几条过道（过道的 x）。要先沿过道走到这一排，再拐进来 */
  aisles?: number[];
  zone: 'fire' | 'hall' | 'cinema';
}

/** 一盏登记过的灯。位置和亮度可以随时改 */
export interface Lamp {
  pos: THREE.Vector3;
  intensity: number;
  distance: number;
  color: THREE.Color;
  /** 到玩家或独立场景中心的水平距离（减去 reach），每帧更新 */
  d: number;
  /** 这盏灯比别的灯多远还亮着（大山洞里照远处洞壁的灯）。不写就是 0 */
  reach?: number;
}

type Updater = (dt: number, t: number, player: THREE.Vector3) => void;

export class World {
  readonly kit = new Kit();
  readonly photos = new PhotoBatch(PETS);
  readonly labels = new LabelBatch();
  readonly colliders: Collider[] = [];
  readonly interactables: Interactable[] = [];
  readonly updaters: Updater[] = [];
  readonly slots = new Map<string, SlotInfo>();
  readonly seats: Seat[] = [];
  readonly uTime = { value: 0 };
  /** 由 main 注入：点击纪念树 / 接待台 / 影厅入口 / 河的洞口 / 沙发时触发；sit 收到的是这张沙发上的座位 */
  hooks = { tree: () => {}, reception: () => {}, river: () => {}, fire: () => {}, lantern: () => {}, cinema: () => {}, cave: () => {}, gate: () => {}, board: (_seat: number) => {}, sit: (_seats: Seat[]) => {} };
  /** 访客脚下的地面高度：桥面高出地面，影厅里的座位一排比一排高 */
  heightAt: (x: number, z: number) => number = () => 0;
  river!: River;
  bonfire!: Bonfire;
  shrine!: Shrine;
  gallery!: Gallery;
  cinema!: Cinema;
  tree!: Tree;
  ride!: CaveRide;

  private lamps: Lamp[] = [];
  private pool: THREE.PointLight[] = [];

  sky!: Sky;
  moonLight!: THREE.DirectionalLight;
  private skyLight!: THREE.HemisphereLight;

  constructor(readonly scene: THREE.Scene, readonly renderer: THREE.WebGLRenderer) {}

  /** 分步搭建，每一步之间可以刷新加载进度 */
  steps(): Array<[keyof typeof STR.loadingSteps, () => void]> {
    return [
      ['sky', () => this.buildLights()],
      ['outdoor', () => buildOutdoor(this)],
      ['river', () => (this.river = buildRiver(this))],
      ['fire', () => (this.bonfire = buildBonfire(this))],
      ['lantern', () => buildLanternTerrace(this)],
      ['hall', () => buildHall(this)],
      ['gallery', () => (this.gallery = buildGallery(this))],
      ['shrine', () => (this.shrine = new Shrine(this))],
      ['cinema', () => (this.cinema = buildCinema(this))],
      ['cave', () => {
        buildGateEntrance(this);
        this.ride = new CaveRide(this);
      }],
      ['finish', () => this.finish()],
    ];
  }

  private buildLights() {
    const { scene } = this;
    scene.background = new THREE.Color(CONFIG.colors.fog);
    scene.fog = new THREE.FogExp2(CONFIG.colors.fog, 0.011);
    this.sky = new Sky(scene);

    this.skyLight = new THREE.HemisphereLight(0x5568b8, 0x1a1626, 1.5);
    scene.add(this.skyLight);

    const moon = new THREE.DirectionalLight(0x9fb6ff, 1.6);
    moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048);
    const cam = moon.shadow.camera;
    cam.left = cam.bottom = -30;
    cam.right = cam.top = 30;
    cam.near = 1;
    cam.far = 160;
    moon.shadow.bias = -0.0006;
    moon.shadow.normalBias = 0.06;
    scene.add(moon, moon.target);
    this.moonLight = moon;
  }

  private finish() {
    for (let i = 0; i < CONFIG.lights.pool; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 20, 1.8);
      this.scene.add(l);
      this.pool.push(l);
    }
    this.kit.build(this.scene);
    this.photos.build(this.scene);
    this.labels.build(this.scene);
  }

  /** 刚创建/编辑完：把某一格换成新宠物，照片、铭牌和石台痕迹原地更新 */
  replacePetAtSlot(slot: number, pet: Pet): PhotoEntry | null {
    const old = PETS[slot];
    const info = old ? this.slots.get(old.id) : undefined;
    if (!old || !info) return null;
    this.photos.replace(slot, old.id, pet);
    const { cell } = slotToPlacement(slot);
    const years = pet.passedDate ? ` · ${pet.passedDate.slice(0, 4)}` : '';
    this.labels.update(slot, `${pet.name}${years}`, String(cell), false);
    info.entry.pet = pet;
    this.slots.delete(old.id);
    this.slots.set(pet.id, info);
    replaceSlotPet(slot, pet);
    this.gallery.refreshSlot(slot, pet);
    return info.entry;
  }

  // ---------- 搭建时用到的小工具 ----------

  collide(cx: number, cz: number, sx: number, sz: number, tall = false) {
    this.colliders.push({ minX: cx - sx / 2, maxX: cx + sx / 2, minZ: cz - sz / 2, maxZ: cz + sz / 2, tall });
  }

  /**
   * 登记一盏暖光灯。场景里的灯很多，真正参与渲染的只有离玩家最近的几盏：
   * 固定数量的 PointLight 每帧被分配给最近的灯位，远处的灯在被换下之前已经淡出到 0。
   */
  pointLight(x: number, y: number, z: number, intensity: number, distance = 22, color = CONFIG.colors.warm): Lamp {
    const lamp: Lamp = { pos: new THREE.Vector3(x, y, z), intensity, distance, color: new THREE.Color(color), d: 0 };
    this.lamps.push(lamp);
    return lamp;
  }

  /**
   * 夜空给场景的底光（天光和月光）有多亮：1 是室外平时的样子。
   * 山洞里调得很暗，只剩洞里自己的灯；出洞时再亮回来。
   */
  setAmbience(k: number) {
    this.skyLight.intensity = 1.5 * k;
    this.moonLight.intensity = 1.6 * k;
  }

  /** 同时点亮的灯的数量（低画质时减少） */
  setLightBudget(n: number) {
    this.pool.forEach((l, i) => (l.visible = i < n));
  }

  private updateLights(p: THREE.Vector3) {
    const { fadeStart, fadeEnd } = CONFIG.lights;
    for (const l of this.lamps) l.d = Math.hypot(l.pos.x - p.x, l.pos.z - p.z) - (l.reach ?? 0);
    this.lamps.sort((a, b) => a.d - b.d);
    this.pool.forEach((light, i) => {
      const lamp = this.lamps[i];
      if (!lamp || !light.visible) {
        light.intensity = 0;
        return;
      }
      light.position.copy(lamp.pos);
      light.color.copy(lamp.color);
      light.distance = lamp.distance;
      light.intensity = lamp.intensity * (1 - THREE.MathUtils.smoothstep(lamp.d, fadeStart, fadeEnd));
    });
  }

  /** 登记一个座位：(x, z) 是坐的位置，(fx, fz) 是座位正面的方向，访客从正面走过来坐下 */
  seat(zone: Seat['zone'], x: number, z: number, top: number, fx: number, fz: number, approach = 0.85, aisles?: number[]) {
    const facing = Math.atan2(-fx, -fz);
    this.seats.push({ x, z, top, facing, zone, aisles, approach: { x: x + fx * approach, z: z + fz * approach } });
  }

  interact(object: THREE.Object3D, label: string, onClick: () => void) {
    this.interactables.push({ object, label, onClick });
  }

  /** 不可见但可点击的方块，用来给一组积木加上交互 */
  proxy(x: number, y: number, z: number, sx: number, sy: number, sz: number, label: string, onClick: () => void) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz));
    m.position.set(x, y, z);
    m.visible = false;
    this.scene.add(m);
    this.interact(m, label, onClick);
  }

  /** who 是小人的位置：月光阴影范围、点亮哪几盏灯都跟着它走 */
  update(dt: number, t: number, camera: THREE.Camera, who: THREE.Vector3, pixelRatio: number) {
    this.uTime.value = t;
    this.kit.update(t);
    tickFlames(t);
    this.sky.update(dt, t, camera, pixelRatio);
    const px = Math.round(who.x);
    const pz = Math.round(who.z);
    this.moonLight.target.position.set(px, 0, pz);
    this.moonLight.position.set(px, 0, pz).addScaledVector(MOON_DIR, 80);
    this.updateLights(who);
    for (const u of this.updaters) u(dt, t, who);
  }
}
