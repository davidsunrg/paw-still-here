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
  /** 脚下的地面高度（桥面会高出地面） */
  heightAt: (x: number, z: number) => number = () => 0;
  /** 点击（非拖拽）时回调 */
  onTap: (x: number, y: number) => void = () => {};

  private keys = new Set<string>();
  private camY = CONFIG.player.eye;
  private bob = 0;
  /** back 为 true 表示正在从聚焦状态退回原来的位置 */
  private focusGoal: { pos: THREE.Vector3; yaw: number; pitch: number; back: boolean } | null = null;
  /** 聚焦之前的位置和朝向，退出时回到这里 */
  private saved: { pos: THREE.Vector3; yaw: number; pitch: number } | null = null;
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
      if (!this.enabled) return;
      if (this.focusGoal) {
        // 退回途中拖动视角，就把控制权交还给访客
        if (!this.focusGoal.back) return;
        this.focusGoal = null;
      }
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
    return this.focusGoal !== null && !this.focusGoal.back;
  }

  teleport(x: number, z: number, yaw: number) {
    this.focusGoal = null;
    this.saved = null;
    this.pos.set(x, 0, z);
    this.yaw = yaw;
    this.pitch = 0;
  }

  /** 把镜头平滑推到某个目标正前方 dist 米处；第一次聚焦时记下当前位置，供退出时返回 */
  focus(target: THREE.Vector3, normal: THREE.Vector3, dist: number) {
    if (!this.focusGoal) this.saved = { pos: this.pos.clone(), yaw: this.yaw, pitch: this.pitch };
    this.focusGoal = {
      pos: target.clone().addScaledVector(normal, dist),
      yaw: Math.atan2(normal.x, normal.z),
      pitch: 0,
      back: false,
    };
    this.focusGoal.pos.y = Math.max(0.95, target.y);
  }

  /** 结束聚焦，镜头退回聚焦前的位置和朝向 */
  release() {
    if (!this.focusGoal || this.focusGoal.back) return;
    const s = this.saved;
    this.saved = null;
    if (!s) {
      this.focusGoal = null;
      return;
    }
    const y = CONFIG.player.eye + this.heightAt(s.pos.x, s.pos.z);
    this.focusGoal = { pos: s.pos.clone().setY(y), yaw: s.yaw, pitch: s.pitch, back: true };
  }

  private get wantsToMove() {
    const K = this.keys;
    return (
      this.stick.lengthSq() > 0.0025 ||
      ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown'].some((c) => K.has(c))
    );
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

    const goal = this.focusGoal;
    if (goal?.back) {
      // 已经回到原位，或者访客开始自己走动，就结束退回
      const near = Math.hypot(goal.pos.x - this.pos.x, goal.pos.z - this.pos.z) < 0.03;
      if (near || (this.enabled && this.wantsToMove)) this.focusGoal = null;
    }

    if (this.focusGoal) {
      const g = this.focusGoal;
      const k = 1 - Math.exp(-dt * 4.5);
      this.pos.x += (g.pos.x - this.pos.x) * k;
      this.pos.z += (g.pos.z - this.pos.z) * k;
      this.camY += (g.pos.y - this.camY) * k;
      this.yaw = angleLerp(this.yaw, g.yaw, k);
      this.pitch += (g.pitch - this.pitch) * k;
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
      const ground = this.heightAt(this.pos.x, this.pos.z);
      this.camY += (eye + ground - this.camY) * (1 - Math.exp(-dt * 5));
    }

    const bobY = moving ? Math.sin(this.bob) * 0.028 : 0;
    this.camera.position.set(this.pos.x, this.camY + bobY, this.pos.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }
}
