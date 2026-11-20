import * as THREE from 'three';
import { CONFIG } from '../config';
import { PETS, type Pet } from '../data/pets';
import { STR } from '../i18n';
import { LabelBatch, PhotoBatch, type PhotoEntry } from './Batches';
import { buildBonfire, type Bonfire } from './Bonfire';
import { buildCinema, type Cinema } from './Cinema';
import { buildLanternTerrace } from './LanternTerrace';
import { buildGallery, type Gallery } from './Gallery';
import { tickFlames } from './gifts';
import { buildHall } from './Hall';
import { Kit } from './Kit';
import { buildOutdoor } from './Outdoor';
import { buildRiver, type River } from './River';
import { MOON_DIR, Sky } from './Sky';
import { Space } from './Space';
import { TREE_POS, TREE_SPAN } from './Tree';

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
  /** 由 main 注入：点击留言簿 / 接待台 / 影厅入口 / 沙发时触发；sit 收到的是这张沙发上的座位 */
  hooks = { guestbook: () => {}, reception: () => {}, river: () => {}, fire: () => {}, lantern: () => {}, cinema: () => {}, sit: (_seats: Seat[]) => {} };
  /** 访客脚下的地面高度：桥面高出地面，影厅里的座位一排比一排高 */
  heightAt: (x: number, z: number) => number = () => 0;
  river!: River;
  bonfire!: Bonfire;
  space!: Space;
  gallery!: Gallery;
  cinema!: Cinema;

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
      ['lantern', () => buildLanternTerrace(this)],
      ['hall', () => buildHall(this)],
      ['gallery', () => (this.gallery = buildGallery(this))],
      ['space', () => (this.space = new Space(this))],
      ['cinema', () => (this.cinema = buildCinema(this))],
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

  /**
   * 从当前位置走到某只宠物相框前的大致路线（用于地面光点指引）。
   * 大厅正中是纪念树和两侧的沙发，直走会穿过去时，改从四周的过道绕。
   */
  routeTo(pet: Pet, from: THREE.Vector3): THREE.Vector3[] {
    const slot = this.slots.get(pet.id);
    if (!slot) return [];
    const { center, normal } = slot.entry;
    const V = (x: number, z: number) => new THREE.Vector3(x, 0, z);
    const pts = [V(from.x, from.z)];
    // 还在室外：先进大门
    if (from.z > 0.5) pts.push(V(0, 1.2), V(0, -3.2));
    const goal = V(center.x + normal.x * 1.5, center.z + normal.z * 1.5);

    // 中间走不过去的一块：树的底座加上两侧的沙发
    const halfX = CONFIG.hall.sofaX + 1;
    const halfZ = TREE_SPAN / 2 + 0.6;
    // 正站在树和沙发之间：先顺着窄道走出这一块
    const here = pts[pts.length - 1];
    if (Math.abs(here.x - TREE_POS.x) < halfX && Math.abs(here.z - TREE_POS.z) < halfZ) {
      // 在窄道里就朝目的地那一头出去；正对着树的底座时只能往外退
      const facingTree = Math.abs(here.x - TREE_POS.x) < TREE_SPAN / 2 + 0.4;
      const side = Math.sign((facingTree ? here.z : goal.z) - TREE_POS.z) || 1;
      pts.push(V(here.x, TREE_POS.z + side * (halfZ + 0.3)));
    }
    const start = pts[pts.length - 1];
    const crosses = (a: THREE.Vector3, b: THREE.Vector3) => {
      const n = Math.ceil(a.distanceTo(b) / 0.25);
      for (let i = 0; i <= n; i++) {
        const x = a.x + ((b.x - a.x) * i) / Math.max(n, 1);
        const z = a.z + ((b.z - a.z) * i) / Math.max(n, 1);
        if (Math.abs(x - TREE_POS.x) < halfX && Math.abs(z - TREE_POS.z) < halfZ) return true;
      }
      return false;
    };
    // 绕着这一块的四个拐角，按顺时针排列
    const lane = CONFIG.gallery.lane;
    const dz = TREE_SPAN / 2 + 2;
    const corners = [[-1, 1], [1, 1], [1, -1], [-1, -1]].map(([sx, sz]) => V(TREE_POS.x + sx * lane, TREE_POS.z + sz * dz));
    let best: THREE.Vector3[] = [];
    let bestLen = Infinity;
    if (!crosses(start, goal)) bestLen = 0;
    else {
      for (let first = 0; first < 4; first++) {
        for (const dir of [1, -1]) {
          for (let count = 1; count <= 3; count++) {
            const via = Array.from({ length: count }, (_, k) => corners[(first + dir * k + 8) % 4]);
            const path = [start, ...via, goal];
            let len = 0;
            let ok = true;
            for (let i = 1; i < path.length && ok; i++) {
              ok = !crosses(path[i - 1], path[i]);
              len += path[i - 1].distanceTo(path[i]);
            }
            if (ok && len < bestLen) {
              bestLen = len;
              best = via;
            }
          }
        }
      }
    }
    pts.push(...best, goal);
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
