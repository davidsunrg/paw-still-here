import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Collider } from '../world/World';

const TAU = Math.PI * 2;

function angleLerp(a: number, b: number, k: number) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return a + d * k;
}

/** 第一人称漫步：键盘 / 摇杆移动，拖拽转视角，简单的 AABB 碰撞 */
export class Player {
  readonly pos = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  /** 打开面板时暂停移动 */
  enabled = true;
  /** 摇杆输入：x 向右，y 向前 */
  readonly stick = new THREE.Vector2();
  /** 点击（非拖拽）时回调 */
  onTap: (x: number, y: number) => void = () => {};

  private keys = new Set<string>();
  private camY = CONFIG.player.eye;
  private bob = 0;
  private focusGoal: { pos: THREE.Vector3; yaw: number } | null = null;
  private lookId = -1;
  private last = { x: 0, y: 0 };
  private down = { x: 0, y: 0, t: 0 };

  constructor(
    private camera: THREE.PerspectiveCamera,
    private dom: HTMLElement,
    private colliders: Collider[],
  ) {
    window.addEventListener('keydown', (e) => {
      const el = e.target as HTMLElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
      this.keys.add(e.code);
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    dom.addEventListener('pointerdown', (e) => {
      if (this.lookId !== -1) return;
      this.lookId = e.pointerId;
      this.last = { x: e.clientX, y: e.clientY };
      this.down = { x: e.clientX, y: e.clientY, t: performance.now() };
      dom.setPointerCapture(e.pointerId);
    });
    dom.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.lookId) return;
      const dx = e.clientX - this.last.x;
      const dy = e.clientY - this.last.y;
      this.last = { x: e.clientX, y: e.clientY };
      if (!this.enabled || this.focusGoal) return;
      const k = 0.0042;
      this.yaw += dx * k;
      this.pitch = THREE.MathUtils.clamp(this.pitch + dy * k, -1.2, 1.35);
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== this.lookId) return;
      this.lookId = -1;
      const moved = Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y);
      if (e.type === 'pointerup' && moved < 7 && performance.now() - this.down.t < 500) {
        this.onTap(e.clientX, e.clientY);
      }
    };
    dom.addEventListener('pointerup', end);
    dom.addEventListener('pointercancel', end);
  }

  get dragging() {
    return this.lookId !== -1;
  }

  get focused() {
    return this.focusGoal !== null;
  }

  teleport(x: number, z: number, yaw: number) {
    this.focusGoal = null;
    this.pos.set(x, 0, z);
    this.yaw = yaw;
    this.pitch = 0;
  }

  /** 把镜头平滑推到相框前 */
  focus(target: THREE.Vector3, normal: THREE.Vector3, dist: number) {
    this.focusGoal = {
      pos: target.clone().addScaledVector(normal, dist),
      yaw: Math.atan2(normal.x, normal.z),
    };
    this.focusGoal.pos.y = Math.max(0.95, target.y);
  }

  release() {
    this.focusGoal = null;
  }

  private blocked(x: number, z: number) {
    const r = CONFIG.player.radius;
    for (const c of this.colliders) {
      if (x > c.minX - r && x < c.maxX + r && z > c.minZ - r && z < c.maxZ + r) return true;
    }
    return Math.abs(x) > 90 || z > 78 || z < -130;
  }

  update(dt: number) {
    const { eye, walk, run } = CONFIG.player;
    let moving = false;

    if (this.focusGoal) {
      const k = 1 - Math.exp(-dt * 4.5);
      this.pos.x += (this.focusGoal.pos.x - this.pos.x) * k;
      this.pos.z += (this.focusGoal.pos.z - this.pos.z) * k;
      this.camY += (this.focusGoal.pos.y - this.camY) * k;
      this.yaw = angleLerp(this.yaw, this.focusGoal.yaw, k);
      this.pitch += (0 - this.pitch) * k;
    } else {
      if (this.enabled) {
        const K = this.keys;
        let f = this.stick.y;
        let s = this.stick.x;
        if (K.has('KeyW') || K.has('ArrowUp')) f += 1;
        if (K.has('KeyS') || K.has('ArrowDown')) f -= 1;
        if (K.has('KeyD')) s += 1;
        if (K.has('KeyA')) s -= 1;
        if (K.has('ArrowLeft') || K.has('KeyQ')) this.yaw += dt * 1.9;
        if (K.has('ArrowRight') || K.has('KeyE')) this.yaw -= dt * 1.9;
        const len = Math.hypot(f, s);
        if (len > 0.05) {
          const speed = (K.has('ShiftLeft') || K.has('ShiftRight') ? run : walk) * Math.min(1, len);
          f /= len;
          s /= len;
          const sin = Math.sin(this.yaw);
          const cos = Math.cos(this.yaw);
          const dx = (-sin * f + cos * s) * speed * dt;
          const dz = (-cos * f - sin * s) * speed * dt;
          if (!this.blocked(this.pos.x + dx, this.pos.z)) this.pos.x += dx;
          if (!this.blocked(this.pos.x, this.pos.z + dz)) this.pos.z += dz;
          moving = true;
          this.bob += dt * speed * 1.9;
        }
      }
      this.camY += (eye - this.camY) * (1 - Math.exp(-dt * 5));
    }

    const bobY = moving ? Math.sin(this.bob) * 0.028 : 0;
    this.camera.position.set(this.pos.x, this.camY + bobY, this.pos.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }
}
