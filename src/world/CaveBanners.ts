import * as THREE from 'three';
import { CONFIG } from '../config';
import { PETS, type Pet } from '../data/pets';
import { canvasTexture, drawPortrait, FONT, makeCanvas } from './textures';

const T = CONFIG.cave.tablets;
/** 石面上画内容的画布大小（宽高比和石面一致） */
const PX = 1024;
const PY = Math.round(PX / T.aspect);

/** 河道上走了 s 米、往右偏到洞底半宽的 inset 倍处：位置和河道的方向 */
export type Place = (s: number, inset: number) => { x: number; z: number; tx: number; tz: number };

interface Tablet {
  ctx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  face: THREE.MeshBasicMaterial;
  lamp: THREE.MeshBasicMaterial;
  /** 现在刻的是第几只；这一只已经亮了多久 */
  index: number;
  t: number;
  pet: Pet | null;
}

/**
 * 思念之河沿途的石面：崖壁上磨平的大石面，每一块上是一只小家伙的照片、名字、日期和主人的一句话，
 * 上沿一条灯照着。两侧洞壁各有几块，船正前方高处的石壁上也有（出洞的船迎面是洞口上方那一块，
 * 进洞的船迎面是洞底码头上方那一块）。
 *
 * 石面的位置是固定的，上面的内容隔一会儿换一只：灯暗下去，再亮起来时是下一只，这样所有的小家伙都会轮到。
 */
export class CaveTablets {
  private tablets: Tablet[] = [];
  private stone = new THREE.MeshStandardMaterial({ color: 0x8f877d, roughness: 0.95, metalness: 0, flatShading: true });
  private warm = new THREE.Color(CONFIG.colors.warm);

  constructor(
    private scene: THREE.Scene,
    place: Place,
  ) {
    // 两侧崖壁：从水里立起来、靠在洞壁上的一整块石头，朝着河道的一面磨平
    for (const [s, side] of T.side.at) {
      const { x, z, tx, tz } = place(s, side * T.side.inset);
      // 往右的方向是 (-tz, tx)；石面朝向河道中线
      this.add(x, T.side.y, z, Math.atan2(side * tz, -side * tx), 0, T.side.w, T.side.depth, true);
    }
    // 正前方高处的石壁：facing 为 1 时朝着河道前进的方向（进洞的船迎面看到），-1 时朝着来路（出洞的船迎面看到）
    for (const [s, lateral, y, w, facing, tilt, depth] of T.front) {
      const { x, z, tx, tz } = place(s, 0);
      this.add(x - tz * lateral, y, z + tx * lateral, Math.atan2(facing * tx, facing * tz), tilt, w, depth, false);
    }
    this.tablets.forEach((tab, i) => {
      // 错开着换，不同时暗下去
      tab.t = T.fade + ((T.every - 2 * T.fade) * i) / this.tablets.length;
      this.show(tab, i);
    });
  }

  /**
   * 一块石面：中心在 (x, y, z)，正面朝 yaw 的方向，往下俯 tilt；宽 w 米，背后的石头厚 depth 米。
   * grounded 的石头一直伸到水下，否则只比石面大一圈（嵌在高处的洞壁上）。
   */
  private add(x: number, y: number, z: number, yaw: number, tilt: number, w: number, depth: number, grounded: boolean) {
    const h = w / T.aspect;
    const group = new THREE.Group();
    group.position.set(x, y, z);
    group.rotation.order = 'YXZ';
    group.rotation.set(tilt, yaw, 0);

    // 立在水里的石头顶上平齐；嵌在高处的往上一直伸进洞顶里，像是从洞顶垂下来的一整块
    const top = h / 2 + T.margin + (grounded ? 0 : 12);
    const bottom = grounded ? -y - 1 : -h / 2 - T.margin;
    const block = new THREE.Mesh(new THREE.BoxGeometry(w + T.margin * 2, top - bottom, depth), this.stone);
    block.position.set(0, (top + bottom) / 2, -depth / 2);

    const [canvas, ctx] = makeCanvas(PX, PY);
    const texture = canvasTexture(canvas);
    const face = new THREE.MeshBasicMaterial({ map: texture });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), face);
    plane.position.z = 0.03;

    // 上沿的一条灯
    const lamp = new THREE.MeshBasicMaterial();
    const strip = new THREE.Mesh(new THREE.BoxGeometry(w * 0.62, 0.09, 0.16), lamp);
    strip.position.set(0, h / 2 + T.margin * 0.45, 0.1);

    group.add(block, plane, strip);
    this.scene.add(group);
    this.tablets.push({ ctx, texture, face, lamp, index: 0, t: 0, pet: null });
  }

  /** 把第 index 只刻到这块石面上 */
  private show(tab: Tablet, index: number) {
    const pet = PETS[index % PETS.length];
    tab.index = index;
    tab.pet = pet;
    const { ctx } = tab;

    // 石面：上亮下暗，像被上沿的灯照着
    const bg = ctx.createLinearGradient(0, 0, 0, PY);
    bg.addColorStop(0, '#e2d8c8');
    bg.addColorStop(1, '#a89d8e');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, PX, PY);
    ctx.strokeStyle = 'rgba(70, 54, 38, 0.35)';
    ctx.lineWidth = 3;
    ctx.strokeRect(20, 20, PX - 40, PY - 40);

    // 左边是照片
    const size = PY - 220;
    const px = 60;
    const py = (PY - size) / 2;
    ctx.fillStyle = '#4a3828';
    ctx.fillRect(px - 10, py - 10, size + 20, size + 20);
    drawPortrait(ctx, px, py, size, pet, 0);
    if (pet.photoUrl) {
      // 真实照片加载完成后裁成正方形盖上去；这期间换了别的宠物就不画了
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        if (tab.pet !== pet) return;
        const s = Math.min(img.width, img.height);
        ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, px, py, size, size);
        tab.texture.needsUpdate = true;
      };
      img.src = pet.photoUrl;
    }

    // 右边是名字、日期和主人的一句话
    const left = px + size + 40;
    const width = PX - 52 - left;
    const cx = left + width / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const fit = (text: string, weight: string, px0: number) => {
      ctx.font = `${weight} ${px0}px ${FONT}`;
      const k = Math.min(1, width / ctx.measureText(text).width);
      ctx.font = `${weight} ${Math.floor(px0 * k)}px ${FONT}`;
    };
    ctx.fillStyle = '#33261a';
    fit(pet.name, '600', 104);
    ctx.fillText(pet.name, cx, py + 50);
    ctx.fillStyle = '#5a4a3a';
    const dates = `${pet.birthDate ?? '?'} — ${pet.passedDate}`;
    fit(dates, '500', 44);
    ctx.fillText(dates, cx, py + 140);
    ctx.fillStyle = 'rgba(70, 54, 38, 0.45)';
    ctx.fillRect(cx - 70, py + 186, 140, 3);

    ctx.fillStyle = '#3d2e20';
    ctx.font = `italic 500 50px ${FONT}`;
    const lines: string[] = [];
    let line = '';
    for (const word of pet.message.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > width) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    if (line) lines.push(line);
    const shown = lines.slice(0, 4);
    const lh = 62;
    const y0 = py + 200 + (size - 200) / 2 - ((shown.length - 1) * lh) / 2;
    shown.forEach((text, i) => ctx.fillText(text, cx, y0 + i * lh));

    tab.texture.needsUpdate = true;
  }

  /** 每一帧：到时间的石面暗下去，换成下一只，再亮起来 */
  update(dt: number) {
    const n = this.tablets.length;
    for (const tab of this.tablets) {
      tab.t += dt;
      if (tab.t >= T.every) {
        tab.t = 0;
        // 每块石面每次往后跳一整轮，所有石面合起来不重不漏地轮过所有的小家伙
        this.show(tab, tab.index + n);
      }
      const k = THREE.MathUtils.smoothstep(Math.min(tab.t, T.every - tab.t) / T.fade, 0, 1);
      tab.face.color.setScalar(T.level * (T.dim + (1 - T.dim) * k));
      tab.lamp.color.copy(this.warm).multiplyScalar(0.3 + 1.5 * k);
    }
  }
}
