import * as THREE from 'three';
import { CONFIG, ZONES } from '../config';
import { PETS, type Pet } from '../data/pets';
import { store } from '../data/store';
import { STR } from '../strings';
import { LabelBatch, PhotoBatch } from './Batches';
import { buildCorridor } from './Corridor';
import { buildHall } from './Hall';
import { Kit } from './Kit';
import { buildMemorial } from './Memorial';
import { buildOutdoor } from './Outdoor';
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
  hasFlower: boolean;
  hasCandle: boolean;
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
  readonly uTime = { value: 0 };
  /** 由 main 注入：点击留言簿 / 接待台时触发 */
  hooks = { guestbook: () => {}, reception: () => {} };

  private lamps: Array<{ pos: THREE.Vector3; intensity: number; distance: number; color: THREE.Color; d: number }> = [];
  private pool: THREE.PointLight[] = [];

  sky!: Sky;
  moonLight!: THREE.DirectionalLight;

  constructor(readonly scene: THREE.Scene) {}

  /** 分步搭建，每一步之间可以刷新加载进度 */
  steps(): Array<[keyof typeof STR.loadingSteps, () => void]> {
    return [
      ['sky', () => this.buildLights()],
      ['outdoor', () => buildOutdoor(this)],
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
  pointLight(x: number, y: number, z: number, intensity: number, distance = 22, color = CONFIG.colors.warm) {
    this.lamps.push({ pos: new THREE.Vector3(x, y, z), intensity, distance, color: new THREE.Color(color), d: 0 });
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

  /** 访客献花 / 点蜡烛后，在对应格子里放上实物 */
  addOffering(pet: Pet, kind: 'flower' | 'candle') {
    const slot = this.slots.get(pet.id);
    if (!slot) return;
    const g = new THREE.Group();
    const { x, y, z } = slot.floor;
    if (kind === 'flower') {
      if (slot.hasFlower) return;
      slot.hasFlower = true;
      const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.005, 0.005, 0.13, 5),
        new THREE.MeshStandardMaterial({ color: 0x4f8a4a }),
      );
      stem.position.y = 0.065;
      const bloom = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.032, 1),
        new THREE.MeshStandardMaterial({ color: 0xff9db0, flatShading: true }),
      );
      bloom.position.y = 0.14;
      g.add(stem, bloom);
      g.position.set(x + 0.27, y, z + 0.1);
    } else {
      if (slot.hasCandle) return;
      slot.hasCandle = true;
      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(0.018, 0.018, 0.07, 8),
        new THREE.MeshStandardMaterial({ color: 0xf6ecd8 }),
      );
      body.position.y = 0.035;
      const flame = new THREE.Mesh(
        new THREE.SphereGeometry(0.014, 8, 6),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffb45a).multiplyScalar(3.2) }),
      );
      flame.scale.set(0.75, 1.5, 0.75);
      flame.position.y = 0.092;
      g.add(body, flame);
      g.position.set(x - 0.27, y, z + 0.1);
    }
    this.scene.add(g);
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

  /** 让月光阴影范围跟着玩家走 */
  update(dt: number, t: number, camera: THREE.Camera, pixelRatio: number) {
    this.uTime.value = t;
    this.kit.update(t);
    this.sky.update(dt, t, camera, pixelRatio);
    const px = Math.round(camera.position.x);
    const pz = Math.round(camera.position.z);
    this.moonLight.target.position.set(px, 0, pz);
    this.moonLight.position.set(px, 0, pz).addScaledVector(MOON_DIR, 80);
    this.updateLights(camera.position);
    for (const u of this.updaters) u(dt, t, camera.position);
  }

  /** 首次搭建时读取已保存的献花 / 蜡烛，决定格子里是否摆放实物 */
  statsOf(pet: Pet) {
    return store.stats(pet);
  }
}
