import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Collider } from '../world/World';
import { NavGrid, type NavPoint } from './Nav';

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

/** 点击地面后要走去的地方 */
interface Goal {
  x: number;
  z: number;
  /** 离目标这么近就算到了 */
  radius: number;
  done?: () => void;
  /** 被挡住、几乎没有前进的时间 */
  stuck: number;
  /** 自动寻路折线；没有寻路结果时直接朝目标走 */
  route?: NavPoint[];
  index: number;
}

/** 单宠物特写 */
interface Focus {
  /** 镜头的位置和朝向 */
  cam: THREE.Vector3;
  yaw: number;
  /** 正对目标时的朝向、离目标多远；turn 是拖动后绕着目标转过的角度，turnTo 是它要去的值 */
  base: number;
  dist: number;
  turn: number;
  turnTo: number;
  /** 镜头转的时候能不能到某个位置；提供时完全负责边界，可用于主场景之外的独立房间 */
  allow?: (x: number, z: number) => boolean;
  /** 小人站到哪里、面向哪里 */
  stand: THREE.Vector3;
  look: THREE.Vector3;
}

/** 一块矩形的活动范围（影厅）：墙本身有碰撞，这里只是代替主场景的边界 */
export interface Room {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
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
  /** 不为空时，小人在这个矩形里活动，不再使用主场景的边界 */
  room: Room | null = null;
  /**
   * 坐在船上：小人的位置和朝向由别处每帧给出，自己不能走动，也不会因为想走而站起来。
   * boomLimit 是镜头最远能离小人多远（洞里窄的地方要拉近），lookUp 是最多能仰视多少。
   */
  riding = false;
  boomLimit = Infinity;
  lookUp = CAM.pitchMax;
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
  /** 单宠物特写：focus 不为空时镜头推到纪念角前，blend 是特写镜头占的比重 */
  private focus: Focus | null = null;
  private lastFocus: Focus | null = null;
  private blend = 0;
  private goal: Goal | null = null;
  /** 当前场景/房间的寻路格，第一次点击时构建 */
  private nav: NavGrid | null = null;
  private navKey = '';
  /** 坐着的时候，记着站起来要回到哪里 */
  private seat: { x: number; z: number } | null = null;
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
      if (!this.enabled) return;
      if (this.focus) {
        // 特写时左右拖动：镜头绕着纪念角转，像把它拿在手里左右转着看
        if (e.pointerId === this.lookId && this.pointers.size === 1) this.turnFocus(-dx * 0.005);
        return;
      }
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
      this.pitch = THREE.MathUtils.clamp(this.pitch + dy * k, CAM.pitchMin, this.lookUp);
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

  /** 特写镜头绕目标转 by 弧度；转到头或者镜头会进墙就不再转 */
  private turnFocus(by: number) {
    const f = this.focus;
    if (!f) return;
    const to = THREE.MathUtils.clamp(f.turnTo + by, -CAM.focusTurn, CAM.focusTurn);
    const x = f.look.x + Math.sin(f.base + to) * f.dist;
    const z = f.look.z + Math.cos(f.base + to) * f.dist;
    // 有 allow 的特写（宠物小屋）建在主场景之外，由它自己的封闭空间判断边界；
    // 没有 allow 时仍沿用主场景的墙和步行范围
    if (f.allow ? f.allow(x, z) : !this.blocked(x, z)) f.turnTo = to;
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

  /** 是否正在自己走向点击的地方 */
  get walking() {
    return this.goal !== null;
  }

  /**
   * 让小人自己走到 (x, z)，到了以后调用 done。
   * 先用当前场景的碰撞体做一次栅格寻路；找不到路时才退回直走。
   */
  walkTo(x: number, z: number, radius = 0.15, done?: () => void) {
    if (this.focus) return;
    const route = this.findRoute(x, z);
    this.goal = { x, z, radius, done, stuck: 0, route: route ?? undefined, index: 0 };
  }

  /** 换了地方（另一处空间、门开了/关了）以后，碰撞变了：下一次寻路重新建栅格 */
  resetNavigation() {
    this.nav = null;
    this.navKey = '';
  }

  /** 当前场景/房间的寻路；主场景和影厅、山洞码头各自用不同的边界 */
  private findRoute(x: number, z: number): NavPoint[] | null {
    const room = this.room;
    const key = room ? `${room.minX},${room.maxX},${room.minZ},${room.maxZ}` : 'main';
    if (!this.nav || this.navKey !== key) {
      const bounds = room ?? { minX: -90, maxX: 90, minZ: -130, maxZ: 78 };
      this.nav = new NavGrid(this.colliders, bounds, CONFIG.player.radius, room ? 0.35 : 0.5);
      this.navKey = key;
    }
    const route = this.nav.findPath({ x: this.pos.x, z: this.pos.z }, { x, z });
    return route && route.length > 1 ? route : null;
  }

  private walk(dt: number) {
    const g = this.goal!;
    if (g.route) {
      while (g.index < g.route.length) {
        const wp = g.route[g.index]!;
        if (Math.hypot(wp.x - this.pos.x, wp.z - this.pos.z) > 0.22) break;
        g.index++;
      }
      if (g.index >= g.route.length) {
        this.goal = null;
        g.done?.();
        return 0;
      }
    }
    const target = g.route ? g.route[g.index]! : g;
    const dx = target.x - this.pos.x;
    const dz = target.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    const arrive = () => {
      this.goal = null;
      g.done?.();
      return 0;
    };
    if (!g.route && d <= g.radius) return arrive();
    const fromX = this.pos.x;
    const fromZ = this.pos.z;
    const speed = Math.min(CONFIG.player.walk, d / dt);
    this.step(dx / d, dz / d, speed, dt, true);
    const moved = Math.hypot(this.pos.x - fromX, this.pos.z - fromZ);
    g.stuck = moved < speed * dt * 0.3 ? g.stuck + dt : Math.max(0, g.stuck - dt);
    if (g.stuck > 0.7) {
      if (!g.route && d <= g.radius + 2.5) return arrive();
      this.goal = null;
      return 0;
    }
    return moved / dt;
  }

  /** 坐到 (x, z) 处、面朝 facing；一有移动的意图就站起来，回到 exit */
  sit(x: number, z: number, facing: number, exit: { x: number; z: number }) {
    this.goal = null;
    this.pos.x = x;
    this.pos.z = z;
    this.facing = facing;
    this.seat = exit;
  }

  /** 从座位上站起来，站到座位前面 */
  stand() {
    if (!this.seat) return;
    this.pos.x = this.seat.x;
    this.pos.z = this.seat.z;
    this.seat = null;
  }

  get seated() {
    return this.seat !== null;
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
    this.goal = null;
    this.seat = null;
    this.blend = 0;
    this.pos.set(x, 0, z);
    this.yaw = yaw;
    this.facing = facing;
    this.pitch = pitch;
    this.boom = this.dist;
    this.stride = 0;
  }

  /**
   * 单宠物特写：镜头平滑推到目标正前方 dist 米处，小人留在原地、面向它。
   */
  focusOn(target: THREE.Vector3, normal: THREE.Vector3, dist: number, allow = this.focus?.allow) {
    const yaw = Math.atan2(normal.x, normal.z);
    const cam = target.clone().addScaledVector(normal, dist);
    cam.y = Math.max(0.95, target.y);
    // 小人留在原地（特写时它是淡出的），只转身面向目标
    const stand = this.focus?.stand ?? this.pos.clone();
    const turn = this.focus?.turn ?? 0;
    this.focus = { cam, yaw, base: yaw, dist, turn, turnTo: this.focus?.turnTo ?? 0, allow, stand, look: target.clone() };
    this.goal = null;
    this.seat = null;
  }

  /** 打开另一只宠物：镜头从正面重新开始 */
  refocus(target: THREE.Vector3, normal: THREE.Vector3, dist: number, allow?: (x: number, z: number) => boolean) {
    this.focus = null;
    this.focusOn(target, normal, dist, allow);
  }

  /** 特写镜头和跟随镜头之间不做过渡，直接切过去（画面暗着换场景的时候用） */
  snapFocus() {
    this.blend = this.focus ? 1 : 0;
    if (!this.focus) this.lastFocus = null;
  }

  /** 结束特写：小人留在原地，镜头回到它身后 */
  release() {
    if (!this.focus) return;
    this.lastFocus = this.focus;
    this.yaw = this.focus.base;
    this.pitch = CAM.pitch;
    this.focus = null;
  }

  /** 小人能不能站在 (x, z) */
  blocked(x: number, z: number) {
    const r = CONFIG.player.radius;
    for (const c of this.colliders) {
      if (x > c.minX - r && x < c.maxX + r && z > c.minZ - r && z < c.maxZ + r) return true;
    }
    const m = this.room;
    if (m) return x < m.minX || x > m.maxX || z < m.minZ || z > m.maxZ;
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
      // 看纪念角时小人留在原地（stand 就是打开时站的位置），只转身面向它
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
    if (!this.enabled || this.riding) {
      this.goal = null;
      // 在船上仍然可以用键盘转头
      if (this.enabled && this.riding) {
        if (this.keys.has('ArrowLeft') || this.keys.has('KeyQ')) this.yaw += dt * 1.9;
        if (this.keys.has('ArrowRight') || this.keys.has('KeyE')) this.yaw -= dt * 1.9;
      }
      return 0;
    }
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
    if (this.seat) {
      if (len < 0.05 && !this.goal) return 0;
      // 想走了：先站起来，回到座位前面
      this.pos.x = this.seat.x;
      this.pos.z = this.seat.z;
      this.seat = null;
    }
    if (len < 0.05) return this.goal ? this.walk(dt) : 0;
    // 自己动手走，就不再去刚才点的地方了
    this.goal = null;
    const fast = K.has('ShiftLeft') || K.has('ShiftRight') || this.stick.length() > CONFIG.player.stickRun;
    const speed = (fast ? run : walk) * Math.min(1, len);
    fw /= len;
    sd /= len;
    // 移动方向相对镜头
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    return this.step(-sin * fw + cos * sd, -cos * fw - sin * sd, speed, dt, true);
  }

  /** 镜头最远能拉到多远而不穿进墙 */
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
    const room = this.clearance(backX, backZ, Math.min(this.dist, this.boomLimit));
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
    if (this.focus) {
      const c = this.focus;
      c.turn += (c.turnTo - c.turn) * (1 - Math.exp(-dt * 14));
      c.yaw = c.base + c.turn;
      c.cam.x = c.look.x + Math.sin(c.yaw) * c.dist;
      c.cam.z = c.look.z + Math.cos(c.yaw) * c.dist;
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
