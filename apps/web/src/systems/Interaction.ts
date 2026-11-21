import * as THREE from 'three';
import { CONFIG } from '../config';
import { STR } from '../i18n';
import type { PhotoEntry } from '../world/Batches';
import { canvasTexture, makeCanvas } from '../world/textures';
import type { Collider, Interactable, World } from '../world/World';

/** far 表示小人离得太远，要先走过去才能打开 */
export type Hit =
  | { kind: 'pet'; entry: PhotoEntry; label: string; far: boolean }
  | { kind: 'object'; item: Interactable; label: string; far: boolean; at: THREE.Vector3 };

/** 线段 (x0,z0)-(x1,z1) 是否穿过包围盒 */
function segmentHits(c: Collider, x0: number, z0: number, x1: number, z1: number) {
  let t0 = 0;
  let t1 = 1;
  const dx = x1 - x0;
  const dz = z1 - z0;
  for (const [p, q] of [
    [-dx, x0 - c.minX], [dx, c.maxX - x0], [-dz, z0 - c.minZ], [dz, c.maxZ - z0],
  ]) {
    if (p === 0) {
      if (q < 0) return false;
    } else {
      const r = q / p;
      if (p < 0) {
        if (r > t1) return false;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return false;
        if (r < t1) t1 = r;
      }
    }
  }
  return true;
}

/** 线段从起点出发，在多远处（0–1）进入包围盒；碰不到返回 1 */
function segmentEnter(c: Collider, x0: number, z0: number, x1: number, z1: number) {
  let t0 = 0;
  let t1 = 1;
  const dx = x1 - x0;
  const dz = z1 - z0;
  for (const [p, q] of [
    [-dx, x0 - c.minX], [dx, c.maxX - x0], [-dz, z0 - c.minZ], [dz, c.maxZ - z0],
  ]) {
    if (p === 0) {
      if (q < 0) return 1;
    } else {
      const r = q / p;
      if (p < 0) {
        if (r > t1) return 1;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return 1;
        if (r < t1) t1 = r;
      }
    }
  }
  return t0;
}

/** 鼠标悬停 / 点击拾取：相框、留言簿、接待台 */
export class Interaction {
  private ray = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private highlight: THREE.Mesh;
  private targets: THREE.Object3D[] = [];

  constructor(
    private camera: THREE.Camera,
    private world: World,
    /** 小人的位置：能不能点到，看的是小人离得够不够近，而不是镜头 */
    private who: THREE.Vector3,
  ) {
    const [c, ctx] = makeCanvas(128, 128);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 7;
    ctx.shadowColor = '#fff';
    ctx.shadowBlur = 10;
    ctx.strokeRect(14, 14, 100, 100);
    this.highlight = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: canvasTexture(c),
        color: new THREE.Color(CONFIG.colors.warm).multiplyScalar(2.2),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.highlight.visible = false;
    world.scene.add(this.highlight);
    this.targets = [...world.photos.meshes, ...world.interactables.map((i) => i.object)];
  }

  pick(clientX: number, clientY: number): Hit | null {
    this.ndc.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    this.ray.far = 30;
    const hit = this.ray.intersectObjects(this.targets, false)[0];
    if (!hit) return null;
    const reach = Math.hypot(hit.point.x - this.who.x, hit.point.z - this.who.z);

    // 视线被墙挡住时不算
    const o = this.ray.ray.origin;
    const back = Math.max(0, hit.distance - 0.6) / hit.distance;
    const ex = o.x + (hit.point.x - o.x) * back;
    const ez = o.z + (hit.point.z - o.z) * back;
    for (const c of this.world.colliders) {
      if (c.tall && segmentHits(c, o.x, o.z, ex, ez)) return null;
    }

    if (this.world.photos.meshes.includes(hit.object as THREE.Mesh)) {
      const entry = this.world.photos.entryOfFace(hit.object as THREE.Mesh, hit.faceIndex ?? 0);
      if (!entry || reach > CONFIG.player.walkRange) return null;
      return { kind: 'pet', entry, label: `${entry.pet.name} · ${STR.tipPet}`, far: reach > CONFIG.player.reachPhoto };
    }
    const item = this.world.interactables.find((i) => i.object === hit.object);
    if (!item || reach > CONFIG.player.walkRange) return null;
    return { kind: 'object', item, label: item.label, far: reach > CONFIG.player.reachObject, at: hit.object.position };
  }

  /**
   * 点击处对应的地面位置，用来让小人走过去。点到天上、太远的地方返回 null；
   * 视线被墙挡住时，返回挡住之前的位置（小人会走到墙边）。
   */
  ground(clientX: number, clientY: number): THREE.Vector3 | null {
    this.ndc.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    const { origin: o, direction: d } = this.ray.ray;
    if (d.y > -0.03) return null;
    const p = o.clone().addScaledVector(d, -o.y / d.y);
    let t = 1;
    for (const c of this.world.colliders) {
      if (c.tall) t = Math.min(t, segmentEnter(c, o.x, o.z, p.x, p.z));
    }
    if (t < 1) {
      const len = Math.hypot(p.x - o.x, p.z - o.z);
      p.lerpVectors(o, p, Math.max(0, t - 0.5 / Math.max(len, 0.5)));
    }
    p.y = 0;
    if (Math.hypot(p.x - this.who.x, p.z - this.who.z) > CONFIG.player.walkRange) return null;
    return p;
  }

  /** 把高亮框套在某个相框上；传 null 隐藏 */
  setHighlight(entry: PhotoEntry | null) {
    this.highlight.visible = !!entry;
    if (!entry) return;
    this.highlight.position.copy(entry.center).addScaledVector(entry.normal, 0.03);
    this.highlight.rotation.y = entry.rotY;
    this.highlight.scale.set(entry.w * 1.42, entry.h * 1.42, 1);
  }

  update(t: number) {
    if (this.highlight.visible) {
      (this.highlight.material as THREE.MeshBasicMaterial).opacity = 0.7 + 0.3 * Math.sin(t * 4);
    }
  }
}
