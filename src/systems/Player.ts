import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Collider } from '../world/World';

const TAU = Math.PI * 2;
const CAM = CONFIG.camera;

function angleLerp(a: number, b: number, k: number) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return a + d * k;
}

/**
 * 从 (x0,z0) 出发的线段在多远处（0–1）碰到包围盒；碰不到返回 1。
 * 起点已经在盒子里时返回 0。
 */
function segmentEnter(c: Collider, pad: number, x0: number, z0: number, x1: number, z1: number) {
  let t0 = 0;
  let t1 = 1;
  const dx = x1 - x0;
  const dz = z1 - z0;
  const tests = [
    [-dx, x0 - (c.minX - pad)],
    [dx, c.maxX + pad - x0],
    [-dz, z0 - (c.minZ - pad)],
    [dz, c.maxZ + pad - z0],
  ];
  for (const [p, q] of tests) {
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

interface Focus {
  /** 镜头的位置和朝向 */
  cam: THREE.Vector3;
  yaw: number;
  /** 小人站到哪里、面向哪里 */
  stand: THREE.Vector3;
  look: THREE.Vector3;
}

/**
 * 第三人称漫步：键盘 / 摇杆控制小人移动，拖拽让镜头绕着小人转，滚轮 / 双指缩放。
 * pos 是小人脚下的位置；yaw / pitch 是镜头的朝向，facing 是小人自己的朝向。
 */
export class Player {
  readonly pos = new THREE.Vector3();
  yaw = 0;
  pitch = CAM.pitch;
  facing = 0;
  /** 步伐相位和幅度，交给小人模型做走路动画 */
  phase = 0;
  stride = 0;
  /** 镜头贴近小人时，小人应有的不透明度 */
  fade = 1;
  /** 打开面板时暂停移动 */
  enabled = true;
  /** 摇杆输入：x 向右，y 向前 */
  readonly stick = new THREE.Vector2();
  /** 脚下的地面高度（桥面会高出地面） */
  heightAt: (x: number, z: number) => number = () => 0;
  /** 点击（非拖拽）时回调 */
  onTap: (x: number, y: number) => void = () => {};

  private keys = new Set<string>();
  /** 镜头想要的距离，和避开遮挡之后实际的距离 */
  private dist = CAM.dist;
  private boom = CAM.dist;
  /** 单宠物特写：focus 不为空时镜头推到格子前，blend 是特写镜头占的比重 */
  private focus: Focus | null = null;
  private lastFocus: Focus | null = null;
  private blend = 0;
  private pointers = new Map<number, { x: number; y: number }>();
  private lookId = -1;
  private pinch = 0;
  private down = { x: 0, y: 0, t: 0, multi: false };

  private pivot = new THREE.Vector3();
  private orbit = new THREE.Vector3();
  private qa = new THREE.Quaternion();
  private qb = new THREE.Quaternion();
  private euler = new THREE.Euler(0, 0, 0, 'YXZ');

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
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 1) {
        this.lookId = e.pointerId;
        this.down = { x: e.clientX, y: e.clientY, t: performance.now(), multi: false };
      } else {
        this.down.multi = true;
        this.pinch = this.pinchSpan();
      }
      dom.setPointerCapture(e.pointerId);
    });
    dom.addEventListener('pointermove', (e) => {
      const last = this.pointers.get(e.pointerId);
      if (!last) return;
      const dx = e.clientX - last.x;
      const dy = e.clientY - last.y;
      last.x = e.clientX;
      last.y = e.clientY;
      if (!this.enabled || this.focus) return;
      if (this.pointers.size >= 2) {
        // 双指缩放
        const span = this.pinchSpan();
        if (this.pinch > 0 && span > 0) this.zoom(this.pinch / span);
        this.pinch = span;
        return;
      }
      if (e.pointerId !== this.lookId) return;
      const k = 0.0042;
      this.yaw += dx * k;
      this.pitch = THREE.MathUtils.clamp(this.pitch + dy * k, CAM.pitchMin, CAM.pitchMax);
    });
    const end = (e: PointerEvent) => {
      if (!this.pointers.delete(e.pointerId)) return;
      if (e.pointerId !== this.lookId) return;
      this.lookId = -1;
      const moved = Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y);
      if (e.type === 'pointerup' && !this.down.multi && moved < 7 && performance.now() - this.down.t < 500) {
        this.onTap(e.clientX, e.clientY);
      }
    };
    dom.addEventListener('pointerup', end);
    dom.addEventListener('pointercancel', end);
    dom.addEventListener(
      'wheel',
      (e) => {
        if (this.enabled && !this.focus) this.zoom(Math.exp(THREE.MathUtils.clamp(e.deltaY, -120, 120) * 0.0016));
      },
      { passive: true },
    );
  }

  private pinchSpan() {
    const [a, b] = [...this.pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  private zoom(factor: number) {
    this.dist = THREE.MathUtils.clamp(this.dist * factor, CAM.min, CAM.max);
  }

  get dragging() {
    return this.pointers.size > 0;
  }

  get focused() {
    return this.focus !== null;
  }

  /** 小人面朝的方向（水平单位向量） */
  forward(out = new THREE.Vector3()) {
    return out.set(-Math.sin(this.facing), 0, -Math.cos(this.facing));
  }

  /** 小人脚下的高度 */
  get ground() {
    return this.heightAt(this.pos.x, this.pos.z);
  }

  /** 把小人放到某处；yaw / pitch 是镜头的朝向，小人默认面向同一个方向 */
  teleport(x: number, z: number, yaw: number, pitch = CAM.pitch, facing = yaw) {
    this.focus = this.lastFocus = null;
    this.blend = 0;
    this.pos.set(x, 0, z);
    this.yaw = yaw;
    this.facing = facing;
    this.pitch = pitch;
    this.boom = this.dist;
    this.stride = 0;
  }

  /**
   * 单宠物特写：镜头平滑推到目标正前方 dist 米处，小人走到目标旁边站好、面向它。
   */
  focusOn(target: THREE.Vector3, normal: THREE.Vector3, dist: number) {
    const yaw = Math.atan2(normal.x, normal.z);
    const cam = target.clone().addScaledVector(normal, dist);
    cam.y = Math.max(0.95, target.y);
    // 站在目标的一侧，不挡住镜头；左边站不下就站右边，都不行就留在原地
    const { standOff, standSide } = CAM;
    const stand = this.focus?.stand ?? this.pos.clone();
    if (!this.focus) {
      for (const side of [-1, 1]) {
        const x = target.x + normal.x * standOff + Math.cos(yaw) * standSide * side;
        const z = target.z + normal.z * standOff - Math.sin(yaw) * standSide * side;
        if (this.blocked(x, z)) continue;
        stand.set(x, 0, z);
        break;
      }
    }
    this.focus = { cam, yaw, stand, look: target.clone() };
  }

  /** 换到同一组里的另一只宠物时，让小人重新选站的位置 */
  refocus(target: THREE.Vector3, normal: THREE.Vector3, dist: number) {
    this.focus = null;
    this.focusOn(target, normal, dist);
  }

  /** 结束特写：小人留在原地，镜头回到它身后 */
  release() {
    if (!this.focus) return;
    this.lastFocus = this.focus;
    this.yaw = this.focus.yaw;
    this.pitch = CAM.pitch;
    this.focus = null;
  }

  private blocked(x: number, z: number) {
    const r = CONFIG.player.radius;
    for (const c of this.colliders) {
      if (x > c.minX - r && x < c.maxX + r && z > c.minZ - r && z < c.maxZ + r) return true;
    }
    return Math.abs(x) > 90 || z > 78 || z < -130;
  }

  /** 朝某个方向迈一步；返回这一步的速度 */
  private step(dx: number, dz: number, speed: number, dt: number, collide: boolean) {
    const mx = dx * speed * dt;
    const mz = dz * speed * dt;
    if (!collide || !this.blocked(this.pos.x + mx, this.pos.z)) this.pos.x += mx;
    if (!collide || !this.blocked(this.pos.x, this.pos.z + mz)) this.pos.z += mz;
    this.facing = angleLerp(this.facing, Math.atan2(-dx, -dz), 1 - Math.exp(-dt * CONFIG.player.turn));
    this.phase += dt * 9.5 * Math.sqrt(speed / CONFIG.player.walk);
    return speed;
  }

  private move(dt: number) {
    const { walk, run } = CONFIG.player;
    const f = this.focus;
    if (f) {
      // 走到格子旁边站好，然后转身面向它
      const dx = f.stand.x - this.pos.x;
      const dz = f.stand.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.04) {
        const speed = Math.min(Math.max(walk, d * 1.6), d / dt);
        return this.step(dx / d, dz / d, speed, dt, false);
      }
      const to = Math.atan2(-(f.look.x - this.pos.x), -(f.look.z - this.pos.z));
      this.facing = angleLerp(this.facing, to, 1 - Math.exp(-dt * 6));
      return 0;
    }
    if (!this.enabled) return 0;
    const K = this.keys;
    let fw = this.stick.y;
    let sd = this.stick.x;
    if (K.has('KeyW') || K.has('ArrowUp')) fw += 1;
    if (K.has('KeyS') || K.has('ArrowDown')) fw -= 1;
    if (K.has('KeyD')) sd += 1;
    if (K.has('KeyA')) sd -= 1;
    if (K.has('ArrowLeft') || K.has('KeyQ')) this.yaw += dt * 1.9;
    if (K.has('ArrowRight') || K.has('KeyE')) this.yaw -= dt * 1.9;
    const len = Math.hypot(fw, sd);
    if (len < 0.05) return 0;
    const speed = (K.has('ShiftLeft') || K.has('ShiftRight') ? run : walk) * Math.min(1, len);
    fw /= len;
    sd /= len;
    // 移动方向相对镜头
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    return this.step(-sin * fw + cos * sd, -cos * fw - sin * sd, speed, dt, true);
  }

  /** 镜头最远能拉到多远而不穿进墙或柜子 */
  private clearance(dirX: number, dirZ: number, want: number) {
    const x0 = this.pivot.x;
    const z0 = this.pivot.z;
    const horizontal = want * Math.cos(this.pitch);
    const x1 = x0 + dirX * horizontal;
    const z1 = z0 + dirZ * horizontal;
    let t = 1;
    for (const c of this.colliders) {
      if (c.tall) t = Math.min(t, segmentEnter(c, CAM.pad, x0, z0, x1, z1));
    }
    let max = want * t;
    // 仰视时镜头不能钻到地面以下
    const sinP = Math.sin(this.pitch);
    if (sinP > 0.01) max = Math.min(max, (this.pivot.y - this.pos.y - CAM.floor) / sinP);
    return Math.max(CAM.near, max);
  }

  update(dt: number) {
    const speed = this.move(dt);
    const amount = speed / CONFIG.player.walk;
    this.stride += (amount - this.stride) * (1 - Math.exp(-dt * 10));
    this.pos.y += (this.ground - this.pos.y) * (1 - Math.exp(-dt * 12));

    // 镜头绕着小人头部附近的一点转
    this.pivot.set(this.pos.x, this.pos.y + CAM.pivot, this.pos.z);
    const cp = Math.cos(this.pitch);
    const backX = Math.sin(this.yaw);
    const backZ = Math.cos(this.yaw);
    const room = this.clearance(backX, backZ, this.dist);
    // 被挡住时立刻拉近，离开遮挡后慢慢恢复
    this.boom = room < this.boom ? room : this.boom + (room - this.boom) * (1 - Math.exp(-dt * 4));
    this.orbit.set(
      this.pivot.x + backX * cp * this.boom,
      this.pivot.y - Math.sin(this.pitch) * this.boom,
      this.pivot.z + backZ * cp * this.boom,
    );
    this.qa.setFromEuler(this.euler.set(this.pitch, this.yaw, 0));

    // 特写镜头和跟随镜头之间平滑过渡
    this.blend += ((this.focus ? 1 : 0) - this.blend) * (1 - Math.exp(-dt * 4.5));
    if (!this.focus && this.blend < 0.002) {
      this.blend = 0;
      this.lastFocus = null;
    }
    const f = this.focus ?? this.lastFocus;
    if (f && this.blend > 0) {
      this.qb.setFromEuler(this.euler.set(0, f.yaw, 0));
      this.camera.position.lerpVectors(this.orbit, f.cam, this.blend);
      this.camera.quaternion.slerpQuaternions(this.qa, this.qb, this.blend);
    } else {
      this.camera.position.copy(this.orbit);
      this.camera.quaternion.copy(this.qa);
    }

    const near = this.camera.position.distanceTo(this.pivot);
    this.fade = THREE.MathUtils.smoothstep(near, CAM.fadeNear, CAM.fadeFar);
  }
}
