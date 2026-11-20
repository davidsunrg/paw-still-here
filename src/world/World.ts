import * as THREE from 'three';
import { CONFIG, ZONES } from '../config';
import { PETS, type Pet } from '../data/pets';
import type { OfferKind } from '../data/store';
import { STR } from '../strings';
import { LabelBatch, PhotoBatch } from './Batches';
import { buildBonfire, type Bonfire } from './Bonfire';
import { buildCorridor } from './Corridor';
import { CELL_SPOT, cellMini, tickFlames } from './gifts';
import { buildHall } from './Hall';
import { Kit } from './Kit';
import { buildMemorial } from './Memorial';
import { buildOutdoor } from './Outdoor';
import { buildRiver, type River } from './River';
import { MOON_DIR, Sky } from './Sky';

export interface Collider {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** 高到足以挡住视线（墙、柜子） */
  tall: boolean;
}

export interface Interactable {
  object: THREE.Object3D;
  label: string;
  onClick: () => void;
}

export interface SlotInfo {
  /** 格子底板中心（世界坐标） */
  floor: THREE.Vector3;
  /** 相框中心 */
  frame: THREE.Vector3;
  cabinetX: number;
  cabinetZ: number;
  /** 格子里已经摆出了哪几类礼物的小摆件 */
  shown: Set<OfferKind>;
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
  zone: 'fire' | 'hall' | 'memorial';
}

/** 一盏登记过的灯。位置和亮度可以随时改（单宠物视角的灯会跟着小龛移动） */
export interface Lamp {
  pos: THREE.Vector3;
  intensity: number;
  distance: number;
  color: THREE.Color;
  /** 到玩家的水平距离，每帧更新 */
  d: number;
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
  /** 由 main 注入：点击留言簿 / 接待台时触发 */
  hooks = { guestbook: () => {}, reception: () => {}, river: () => {}, fire: () => {} };
  /** 访客脚下的地面高度，目前只有桥面高出地面 */
  heightAt: (x: number, z: number) => number = () => 0;
  river!: River;
  bonfire!: Bonfire;

  private lamps: Lamp[] = [];
  private pool: THREE.PointLight[] = [];

  sky!: Sky;
  moonLight!: THREE.DirectionalLight;

  constructor(readonly scene: THREE.Scene) {}

  /** 分步搭建，每一步之间可以刷新加载进度 */
  steps(): Array<[keyof typeof STR.loadingSteps, () => void]> {
    return [
      ['sky', () => this.buildLights()],
      ['outdoor', () => buildOutdoor(this)],
      ['river', () => (this.river = buildRiver(this))],
      ['fire', () => (this.bonfire = buildBonfire(this))],
      ['hall', () => buildHall(this)],
      ['corridor', () => buildCorridor(this)],
      ['memorial', () => buildMemorial(this)],
      ['finish', () => this.finish()],
    ];
  }

  private buildLights() {
    const { scene } = this;
    scene.background = new THREE.Color(CONFIG.colors.fog);
    scene.fog = new THREE.FogExp2(CONFIG.colors.fog, 0.011);
    this.sky = new Sky(scene);

    scene.add(new THREE.HemisphereLight(0x5568b8, 0x1a1626, 1.5));

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

  /** 同时点亮的灯的数量（低画质时减少） */
  setLightBudget(n: number) {
    this.pool.forEach((l, i) => (l.visible = i < n));
  }

  private updateLights(p: THREE.Vector3) {
    const { fadeStart, fadeEnd } = CONFIG.lights;
    for (const l of this.lamps) l.d = Math.hypot(l.pos.x - p.x, l.pos.z - p.z);
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
  seat(zone: Seat['zone'], x: number, z: number, top: number, fx: number, fz: number, approach = 0.85) {
    const facing = Math.atan2(-fx, -fz);
    this.seats.push({ x, z, top, facing, zone, approach: { x: x + fx * approach, z: z + fz * approach } });
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

  /** 访客放入礼物后，如果柜子格子里还没有这一类的小摆件，就补上一个 */
  showInCell(pet: Pet, kind: OfferKind) {
    const slot = this.slots.get(pet.id);
    if (!slot || slot.shown.has(kind)) return;
    slot.shown.add(kind);
    const mini = cellMini(kind, pet.slot);
    mini.position.add(new THREE.Vector3(slot.floor.x + CELL_SPOT[kind][0], slot.floor.y, slot.floor.z + CELL_SPOT[kind][1]));
    this.scene.add(mini);
  }

  /** 从当前位置走到某只宠物格子前的大致路线（用于地面光点指引） */
  routeTo(pet: Pet, from: THREE.Vector3): THREE.Vector3[] {
    const slot = this.slots.get(pet.id);
    if (!slot) return [];
    const pts: THREE.Vector3[] = [new THREE.Vector3(from.x, 0, from.z)];
    const add = (x: number, z: number) => pts.push(new THREE.Vector3(x, 0, z));
    const lane = Math.sign(slot.cabinetX) * 6.5;
    const frontZ = slot.cabinetZ + 1.3;
    if (from.z > ZONES.memFront - 1) {
      if (from.z > 0.5) add(0, 1.2);
      if (from.z > ZONES.hallBack + 1) add(0, ZONES.hallBack + 1);
      add(0, ZONES.memFront - 1.5);
      add(lane, ZONES.memFront - 3.5);
    } else if (Math.abs(from.z - frontZ) > 1 || Math.sign(from.x) !== Math.sign(slot.cabinetX)) {
      add(lane, from.z);
    }
    add(lane, frontZ);
    add(slot.frame.x, frontZ);
    return pts;
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
