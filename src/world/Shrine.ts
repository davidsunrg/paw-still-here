import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Pet } from '../data/pets';
import { store, type OfferKind } from '../data/store';
import type { PhotoEntry } from './Batches';
import { candle, flowerStem, letter, snack, toy, vase } from './gifts';
import { textMesh } from './textures';
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

/** 礼物落到台面上的高度和时长 */
const DROP_H = 0.28;
const DROP_TIME = 0.6;

export type ShrineHit = 'letter' | 'niche' | null;

/**
 * 单宠物视角里的小龛。
 * 柜子里的一格太小放不下东西，所以点开某只宠物时，从它的相框位置「长」出一个更宽更深的小龛，
 * 停在相框前方；同时用一块暗幕把后面的柜子压暗，让视线集中在这一格上。
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
  private veil: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private photo: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private plaqueText: THREE.Mesh | null = null;
  private lamp: Lamp;
  private placed: Record<OfferKind, THREE.Object3D[]> = { flower: [], candle: [], snack: [], toy: [], letter: [] };
  private drops: Array<{ o: THREE.Object3D; y: number; t: number }> = [];
  private from = new THREE.Vector3();
  private k = 0;
  private opening = false;
  private ray = new THREE.Raycaster();
  private ndc = new THREE.Vector2();

  constructor(private world: World) {
    const C = CONFIG.colors;
    const wood = new THREE.MeshStandardMaterial({ color: C.wood, roughness: 0.8 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x3d2a1e, roughness: 0.9 });
    const box = new THREE.BoxGeometry(1, 1, 1);
    const add = (m: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
      const mesh = new THREE.Mesh(box, m);
      mesh.position.set(x, y, z);
      mesh.scale.set(sx, sy, sz);
      this.root.add(mesh);
      return mesh;
    };
    const b = 0.036;

    // 外壳：背板、上下板、两侧板
    add(dark, 0, 0, BACK - 0.012, S.w, S.h, 0.024);
    add(wood, 0, -S.h / 2, 0, S.w + b, b, S.d);
    add(wood, 0, S.h / 2, 0, S.w + b, b, S.d);
    for (const sx of [-1, 1]) add(wood, (sx * S.w) / 2, 0, 0, b, S.h, S.d);
    // 台面上铺的一块浅色衬布
    add(new THREE.MeshStandardMaterial({ color: 0xa8957c, roughness: 1 }), 0, FLOOR - 0.004, 0.01, S.w - 0.1, 0.008, S.d - 0.06);
    // 顶部的灯条
    add(
      new THREE.MeshBasicMaterial({ color: new THREE.Color(C.warm).multiplyScalar(1.7) }),
      0, S.h / 2 - b / 2 - 0.008, S.d / 2 - 0.07, S.w * 0.7, 0.014, 0.03,
    );

    // 相框、照片和名牌
    add(new THREE.MeshStandardMaterial({ color: 0xb08d57, roughness: 0.6 }), 0, 0.09, BACK + 0.02, 0.6, 0.6, 0.04);
    add(dark, 0, 0.09, BACK + 0.036, 0.54, 0.54, 0.012);
    this.photo = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 0.5),
      new THREE.MeshBasicMaterial({ map: world.photos.map, color: 0xe6e0da }),
    );
    this.photo.position.set(0, 0.09, BACK + 0.044);
    this.root.add(this.photo);
    add(new THREE.MeshStandardMaterial({ color: 0xd9bd84, roughness: 0.55 }), 0, -0.285, BACK + 0.012, 0.56, 0.1, 0.024);

    this.items.add(this.letters);
    this.root.add(this.items);
    this.root.visible = false;
    world.scene.add(this.root);

    // 暗幕：贴在柜子（或照片墙）前面的一大块半透明黑色，只压暗它后面的东西
    this.veil = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 16),
      new THREE.MeshBasicMaterial({ color: 0x04050d, transparent: true, opacity: 0, depthWrite: false, fog: false }),
    );
    this.veil.renderOrder = 10;
    this.veil.visible = false;
    world.scene.add(this.veil);

    // 小龛自己的灯，同样走灯位分配机制；不用时挪到很远的地方
    this.lamp = world.pointLight(1e6, 0, 0, 0, 6, 0xffd9a8);
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
    this.center.y = THREE.MathUtils.clamp(entry.center.y, S.minY, S.maxY);

    this.root.rotation.y = entry.rotY;
    this.root.visible = true;
    this.veil.position.copy(entry.center).addScaledVector(entry.normal, 0.25);
    this.veil.rotation.y = entry.rotY;
    this.veil.visible = true;
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

  /** 点击落在小龛的什么位置：信、小龛本身，还是外面 */
  pick(clientX: number, clientY: number, camera: THREE.Camera): ShrineHit {
    if (!this.root.visible) return null;
    this.ndc.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
    this.ray.setFromCamera(this.ndc, camera);
    const hit = this.ray.intersectObject(this.root, true)[0];
    if (!hit) return null;
    for (let o: THREE.Object3D | null = hit.object; o; o = o.parent) {
      if (o === this.letters) return 'letter';
    }
    return 'niche';
  }

  update(dt: number) {
    if (!this.root.visible) return;
    this.k = THREE.MathUtils.clamp(this.k + ((this.opening ? 1 : -1) * dt) / S.time, 0, 1);
    this.apply();

    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.t = Math.min(1, d.t + dt / DROP_TIME);
      d.o.position.y = d.y + DROP_H * Math.pow(1 - d.t, 3);
      if (d.t >= 1) this.drops.splice(i, 1);
    }

    if (!this.opening && this.k === 0) {
      this.root.visible = false;
      this.veil.visible = false;
      this.entry = null;
      this.lamp.pos.x = 1e6;
    }
  }

  private apply() {
    const e = this.k * this.k * (3 - 2 * this.k);
    this.root.position.lerpVectors(this.from, this.center, e);
    this.root.scale.setScalar(THREE.MathUtils.lerp(S.startScale, 1, e));
    this.veil.material.opacity = S.veil * e;
    this.lamp.intensity = S.light * e;
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
    this.plaqueText = textMesh(`${pet.name} · ${years}`, { height: 0.075, color: '#3d2a14' });
    this.plaqueText.position.set(0, -0.285, BACK + 0.026);
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
