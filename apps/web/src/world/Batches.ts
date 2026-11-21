import * as THREE from 'three';
import type { Pet } from '../data/pets';
import { canvasTexture, drawPortrait, FONT, makeCanvas } from './textures';

export interface PhotoEntry {
  pet: Pet;
  center: THREE.Vector3;
  normal: THREE.Vector3;
  rotY: number;
  w: number;
  h: number;
}

/** 把一批朝向任意的矩形合并进一个几何体 */
class QuadBatch {
  private pos: number[] = [];
  private uv: number[] = [];
  private idx: number[] = [];
  private n = 0;

  /** uv: [u0, vBottom, u1, vTop] */
  quad(center: THREE.Vector3, rotY: number, w: number, h: number, uv: [number, number, number, number]) {
    const rx = Math.cos(rotY) * (w / 2);
    const rz = -Math.sin(rotY) * (w / 2);
    const { x, y, z } = center;
    const hh = h / 2;
    this.pos.push(
      x - rx, y - hh, z - rz,
      x + rx, y - hh, z + rz,
      x + rx, y + hh, z + rz,
      x - rx, y + hh, z - rz,
    );
    const [u0, v0, u1, v1] = uv;
    this.uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
    const b = this.n * 4;
    this.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    this.n++;
  }

  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

/**
 * 所有宠物照片共用一张图集和一个网格：
 * 每只宠物在图集里占一格，照片墙上的相框和纪念角里的照片都引用同一格。
 */
export class PhotoBatch {
  static readonly CELL = 204;
  static readonly COLS = 10;
  static readonly SIZE = 2048;

  readonly entries: PhotoEntry[] = [];
  mesh?: THREE.Mesh;
  private quads = new QuadBatch();
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private texture: THREE.CanvasTexture;
  private cellOf = new Map<string, number>();
  /** 每一格现在属于哪只宠物：照片异步加载回来时，避免旧照片盖住新宠物 */
  private owner: string[] = [];

  constructor(pets: Pet[]) {
    [this.canvas, this.ctx] = makeCanvas(PhotoBatch.SIZE, PhotoBatch.SIZE);
    this.texture = canvasTexture(this.canvas);
    const { CELL, COLS } = PhotoBatch;
    pets.forEach((pet, i) => {
      this.cellOf.set(pet.id, i);
      this.owner[i] = pet.id;
      const x = (i % COLS) * CELL;
      const y = Math.floor(i / COLS) * CELL;
      drawPortrait(this.ctx, x, y, CELL, pet);
      if (pet.photoUrl) this.loadPhoto(pet.photoUrl, x, y, i, pet.id);
    });
  }

  /** 真实照片加载完成后，以「裁剪填满」的方式覆盖占位画像 */
  private loadPhoto(url: string, x: number, y: number, index: number, ownerId: string) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (this.owner[index] !== ownerId) return;
      const { CELL } = PhotoBatch;
      const s = Math.min(img.width, img.height);
      this.ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, x, y, CELL, CELL);
      this.texture.needsUpdate = true;
    };
    img.src = url;
  }

  /** 换掉某一格：先画占位画像，再把新照片异步盖上去 */
  replace(slot: number, oldId: string, pet: Pet) {
    const index = this.cellOf.get(oldId) ?? slot;
    const { CELL, COLS } = PhotoBatch;
    const x = (index % COLS) * CELL;
    const y = Math.floor(index / COLS) * CELL;
    this.cellOf.delete(oldId);
    this.cellOf.set(pet.id, index);
    this.owner[index] = pet.id;
    drawPortrait(this.ctx, x, y, CELL, pet);
    this.texture.needsUpdate = true;
    const entry = this.entries.find((e) => e.pet.id === oldId);
    if (entry) entry.pet = pet;
    if (pet.photoUrl) this.loadPhoto(pet.photoUrl, x, y, index, pet.id);
  }

  /** 图集纹理，纪念角里的照片也用它 */
  get map() {
    return this.texture;
  }

  /** 某只宠物在图集里的范围：[u0, vBottom, u1, vTop] */
  uvOf(pet: Pet): [number, number, number, number] {
    const { CELL, COLS, SIZE } = PhotoBatch;
    const i = this.cellOf.get(pet.id) ?? 0;
    const inset = 2;
    const cx = (i % COLS) * CELL;
    const cy = Math.floor(i / COLS) * CELL;
    return [
      (cx + inset) / SIZE,
      1 - (cy + CELL - inset) / SIZE,
      (cx + CELL - inset) / SIZE,
      1 - (cy + inset) / SIZE,
    ];
  }

  add(pet: Pet, center: THREE.Vector3, rotY: number, w: number, h: number) {
    this.quads.quad(center, rotY, w, h, this.uvOf(pet));
    this.entries.push({
      pet,
      center: center.clone(),
      normal: new THREE.Vector3(Math.sin(rotY), 0, Math.cos(rotY)),
      rotY,
      w,
      h,
    });
    return this.entries[this.entries.length - 1];
  }

  build(parent: THREE.Object3D) {
    const mat = new THREE.MeshBasicMaterial({ map: this.texture, color: 0xd8d2cc });
    this.mesh = new THREE.Mesh(this.quads.geometry(), mat);
    this.mesh.frustumCulled = false;
    parent.add(this.mesh);
  }

  /** 由射线命中的三角面序号反查是哪张照片 */
  entryOfFace(faceIndex: number) {
    return this.entries[Math.floor(faceIndex / 2)];
  }
}

/** 相框下方的小名牌，同样合并成一张图集 + 一个网格 */
export class LabelBatch {
  private static readonly CW = 256;
  private static readonly CH = 64;
  private static readonly W = 2048;
  private static readonly H = 2048;

  private quads = new QuadBatch();
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private texture?: THREE.CanvasTexture;
  private count = 0;

  constructor() {
    [this.canvas, this.ctx] = makeCanvas(LabelBatch.W, LabelBatch.H);
  }

  /** tag 是写在名牌左角的小字（格号）；blank 为 true 时是空格子的名牌：石色、只有格号 */
  add(text: string, center: THREE.Vector3, rotY: number, w: number, h: number, tag = '', blank = false) {
    const { CW, CH, W, H } = LabelBatch;
    const cols = W / CW;
    if (this.count >= cols * (H / CH)) return -1;
    const index = this.count++;
    this.paint(index, text, tag, blank);
    const x = (index % cols) * CW;
    const y = Math.floor(index / cols) * CH;
    this.quads.quad(center, rotY, w, h, [x / W, 1 - (y + CH) / H, (x + CW) / W, 1 - y / H]);
    return index;
  }

  /** 换掉某一格的文字：图集里的位置和墙面上的牌子都不动 */
  update(index: number, text: string, tag = '', blank = false) {
    if (index < 0 || index >= this.count) return;
    this.paint(index, text, tag, blank);
    if (this.texture) this.texture.needsUpdate = true;
  }

  private paint(index: number, text: string, tag: string, blank: boolean) {
    const { CW, CH, W } = LabelBatch;
    const cols = W / CW;
    const x = (index % cols) * CW;
    const y = Math.floor(index / cols) * CH;
    const ctx = this.ctx;
    const g = ctx.createLinearGradient(0, y, 0, y + CH);
    g.addColorStop(0, blank ? '#8d8880' : '#e9d3a2');
    g.addColorStop(1, blank ? '#7a756e' : '#c9a868');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, CW, CH);
    ctx.strokeStyle = blank ? 'rgba(40,36,32,0.4)' : 'rgba(90,60,20,0.55)';
    ctx.lineWidth = 3;
    ctx.strokeRect(x + 3, y + 3, CW - 6, CH - 6);
    ctx.textBaseline = 'middle';
    if (blank) {
      ctx.fillStyle = 'rgba(30,27,24,0.7)';
      ctx.font = `500 30px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(tag, x + CW / 2, y + CH / 2 + 2);
    } else {
      const left = tag ? 44 : 0;
      if (tag) {
        ctx.fillStyle = 'rgba(90,60,20,0.8)';
        ctx.font = `500 23px ${FONT}`;
        ctx.textAlign = 'left';
        ctx.fillText(tag, x + 11, y + CH / 2 + 2);
      }
      ctx.fillStyle = '#3d2a14';
      ctx.font = `600 32px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(text, x + (CW + left) / 2, y + CH / 2 + 2, CW - 20 - left);
    }
  }

  build(parent: THREE.Object3D) {
    this.texture = canvasTexture(this.canvas);
    const mat = new THREE.MeshBasicMaterial({ map: this.texture, color: 0xc8c0b4 });
    const mesh = new THREE.Mesh(this.quads.geometry(), mat);
    mesh.frustumCulled = false;
    parent.add(mesh);
  }
}
