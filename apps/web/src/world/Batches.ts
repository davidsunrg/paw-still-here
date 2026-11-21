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
  /** 它在这套图集的第几页 */
  page: number;
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

interface PhotoPage {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  quads: QuadBatch;
  mesh?: THREE.Mesh;
  firstEntry: number;
}

/**
 * 所有宠物照片共用一套分页图集：每页 10×10 格，照片墙和纪念角都引用同一格。
 * 超过一页（100 只）时自动开下一页，容量只受图片数量限制。
 */
export class PhotoBatch {
  static readonly CELL = 204;
  static readonly COLS = 10;
  static readonly SIZE = 2048;
  static readonly PER_PAGE = PhotoBatch.COLS * Math.floor(PhotoBatch.SIZE / PhotoBatch.CELL);

  readonly entries: PhotoEntry[] = [];
  readonly meshes: THREE.Mesh[] = [];
  private pages: PhotoPage[] = [];
  private cellOf = new Map<string, { page: number; index: number }>();
  /** 每一格现在属于哪只宠物：照片异步加载回来时，避免旧照片盖住新宠物 */
  private owner: string[] = [];

  constructor(pets: Pet[]) {
    pets.forEach((pet, i) => {
      const at = PhotoBatch.location(i);
      const page = this.ensurePage(at.page);
      this.cellOf.set(pet.id, at);
      this.owner[i] = pet.id;
      const { x, y } = PhotoBatch.rect(at.index);
      drawPortrait(page.ctx, x, y, PhotoBatch.CELL, pet);
      if (pet.photoUrl) this.loadPhoto(at, pet.photoUrl, i, pet.id);
    });
  }

  private static location(index: number) {
    return { page: Math.floor(index / PhotoBatch.PER_PAGE), index: index % PhotoBatch.PER_PAGE };
  }

  private static rect(index: number) {
    const { CELL, COLS } = PhotoBatch;
    return { x: (index % COLS) * CELL, y: Math.floor(index / COLS) * CELL };
  }

  private ensurePage(pageIndex: number) {
    while (this.pages.length <= pageIndex) {
      const [canvas, ctx] = makeCanvas(PhotoBatch.SIZE, PhotoBatch.SIZE);
      this.pages.push({ canvas, ctx, texture: canvasTexture(canvas), quads: new QuadBatch(), firstEntry: -1 });
    }
    return this.pages[pageIndex]!;
  }

  /** 真实照片加载完成后，以「裁剪填满」的方式覆盖占位画像 */
  private loadPhoto(at: { page: number; index: number }, url: string, globalIndex: number, ownerId: string) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (this.owner[globalIndex] !== ownerId) return;
      const page = this.pages[at.page];
      if (!page) return;
      const { CELL } = PhotoBatch;
      const { x, y } = PhotoBatch.rect(at.index);
      const s = Math.min(img.width, img.height);
      page.ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, x, y, CELL, CELL);
      page.texture.needsUpdate = true;
    };
    img.src = url;
  }

  /** 换掉某一格：先画占位画像，再把新照片异步盖上去 */
  replace(slot: number, oldId: string, pet: Pet) {
    const at = this.cellOf.get(oldId);
    if (!at) return;
    const page = this.pages[at.page];
    if (!page) return;
    const { x, y } = PhotoBatch.rect(at.index);
    this.cellOf.delete(oldId);
    this.cellOf.set(pet.id, at);
    this.owner[slot] = pet.id;
    drawPortrait(page.ctx, x, y, PhotoBatch.CELL, pet);
    page.texture.needsUpdate = true;
    const entry = this.entries.find((e) => e.pet.id === oldId);
    if (entry) entry.pet = pet;
    if (pet.photoUrl) this.loadPhoto(at, pet.photoUrl, slot, pet.id);
  }

  /** 第一页的纹理；纪念角打开时会按宠物切到它所在的页 */
  get map() {
    return this.pages[0]!.texture;
  }

  /** 这只宠物所在的图集页纹理 */
  textureOf(pet: Pet): THREE.CanvasTexture {
    const at = this.cellOf.get(pet.id);
    return (at ? this.pages[at.page] : this.pages[0])!.texture;
  }

  private uvAt(at: { page: number; index: number }): [number, number, number, number] {
    const { CELL, COLS, SIZE } = PhotoBatch;
    const inset = 2;
    const cx = (at.index % COLS) * CELL;
    const cy = Math.floor(at.index / COLS) * CELL;
    return [
      (cx + inset) / SIZE,
      1 - (cy + CELL - inset) / SIZE,
      (cx + CELL - inset) / SIZE,
      1 - (cy + inset) / SIZE,
    ];
  }

  /** 某只宠物在图集里的范围：[u0, vBottom, u1, vTop] */
  uvOf(pet: Pet): [number, number, number, number] {
    return this.uvAt(this.cellOf.get(pet.id) ?? { page: 0, index: 0 });
  }

  add(pet: Pet, center: THREE.Vector3, rotY: number, w: number, h: number) {
    const at = this.cellOf.get(pet.id) ?? { page: 0, index: 0 };
    const page = this.ensurePage(at.page);
    if (page.firstEntry < 0) page.firstEntry = this.entries.length;
    page.quads.quad(center, rotY, w, h, this.uvAt(at));
    const entry: PhotoEntry = {
      pet,
      center: center.clone(),
      normal: new THREE.Vector3(Math.sin(rotY), 0, Math.cos(rotY)),
      rotY,
      w,
      h,
      page: at.page,
    };
    this.entries.push(entry);
    return entry;
  }

  build(parent: THREE.Object3D) {
    for (const page of this.pages) {
      const mat = new THREE.MeshBasicMaterial({ map: page.texture, color: 0xd8d2cc });
      page.mesh = new THREE.Mesh(page.quads.geometry(), mat);
      page.mesh.frustumCulled = false;
      parent.add(page.mesh);
      this.meshes.push(page.mesh);
    }
  }

  /** 由射线命中的图集页和三角面序号反查是哪张照片 */
  entryOfFace(mesh: THREE.Mesh, faceIndex: number) {
    const page = this.pages.find((p) => p.mesh === mesh);
    if (!page || page.firstEntry < 0) return undefined;
    return this.entries[page.firstEntry + Math.floor(faceIndex / 2)];
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
