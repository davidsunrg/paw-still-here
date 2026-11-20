import * as THREE from 'three';
import { CONFIG } from '../config';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { STR } from '../i18n';
import { mulberry32 } from '../data/pets';
import { AvatarBatch, defaultPose, type AvatarPose } from './Avatar';
import { textMesh } from './textures';
import type { Lamp, World } from './World';

const V = CONFIG.cave;
const B = V.boat;

/** 颜色：洞壁是偏浅的石灰岩色（彩色的灯打上去才看得出颜色） */
const COL = {
  wall: 0x8a8279,
  rocks: [0x7b746c, 0x716b64, 0x676159],
  water: 0x08202c,
};

/** 沿途的灯用到的颜色 */
const HUE = {
  amber: 0xffa850,
  teal: 0x40d8c8,
  purple: 0xa860ff,
  pink: 0xff5fa8,
  cyan: 0x40c0ff,
  blue: 0x6090ff,
};

/**
 * 照洞壁和洞顶的大灯：在河道上走了多远的地方、偏离中线多少（正数在右手边）、多高、颜色、亮度。
 * 灯本身看不见，只看得到它照亮的那一片洞壁和水面。
 */
type Light = [s: number, side: number, y: number, color: number, intensity: number];
const LIGHTS: Light[] = [
  [6, -17, 8, HUE.amber, 300],
  [26, 22, 9, HUE.teal, 380],
  [46, -23, 9, HUE.purple, 420],
  [56, 2, 19, HUE.blue, 260],
  [66, 23, 9, HUE.pink, 380],
  [84, -22, 9, HUE.cyan, 380],
  [98, 14, 8, HUE.amber, 260],
];

/** 露天的一段从哪里开始（横截面里第一个洞顶高度为 0 的地方） */
const OPEN_AT = V.profile.find((k) => k[2] === 0)![0];

/** 河道上走了 s 米处的洞底半宽和洞顶高度 */
function profileAt(s: number) {
  const P = V.profile;
  let i = 0;
  while (i < P.length - 2 && s > P[i + 1][0]) i++;
  const [s0, w0, c0] = P[i];
  const [s1, w1, c1] = P[i + 1];
  const k = THREE.MathUtils.smoothstep(s, s0, s1);
  // 露天的一段没有洞顶：高度沿用出洞前最后的值
  const ceil = c0 && c1 ? c0 + (c1 - c0) * k : c0 || c1 || 15;
  return { half: w0 + (w1 - w0) * k, ceil };
}

/**
 * 洞里上船的地方，位置都相对河道的起点（x 往右，z 往后，也就是船来的方向）：
 * 洞壁高处一个石台（从大厅过来就站在这里），一段石阶往前走下去，下面是贴着河道的木码头。
 * 三段在一条直线上，宽度相同。
 */
const ST = {
  x0: 1.1,
  x1: 5,
  /** 石台后沿（通往大厅的门洞）、石阶从哪里开始往下、石阶的脚、码头的尽头 */
  top: 9.5,
  stairs: 5,
  foot: -3,
  end: -16,
  steps: 16,
  ledge: V.station.ledge,
  deck: V.station.deck,
};
const STEP_RUN = (ST.stairs - ST.foot) / ST.steps;
const STEP_RISE = (ST.ledge - ST.deck) / ST.steps;

/** 上船的地方脚下有多高 */
function stationHeight(lz: number) {
  if (lz >= ST.stairs) return ST.ledge;
  if (lz <= ST.foot) return ST.deck;
  return ST.ledge - Math.ceil((ST.stairs - lz) / STEP_RUN) * STEP_RISE;
}

/** 船上的六个座位：相对船的中心，往右多少、往船尾多少。偶数号靠码头一侧 */
const SEATS: Array<[number, number]> = [[0.4, -1.1], [-0.4, -1.1], [0.4, 0], [-0.4, 0], [0.4, 1.1], [-0.4, 1.1]];
/** 船上横板的高度；坐着时小人比站着高出多少 */
const BENCH = 0.42;
const SEAT_LIFT = BENCH - CONFIG.player.sitHip;
/** 船从哪里出现、漂到哪里消失（相对河道的起点 / 终点） */
const APPEAR = -15;
const VANISH = 16;

type BoatState = 'idle' | 'arriving' | 'moored' | 'sailing';

interface Boat {
  group: THREE.Group;
  mats: THREE.Material[];
  s: number;
  state: BoatState;
  /** 六个座位上坐的是谁（别的访客）；自己坐的座位记在 mine 里 */
  riders: Array<Rider | null>;
  x: number;
  z: number;
  facing: number;
  fade: number;
  bob: number;
}

/** 一位同乘的访客：从门洞走下石阶，在码头上等船，船到了坐上去，跟着船漂走 */
interface Rider {
  pose: AvatarPose;
  state: 'walk' | 'wait' | 'hop' | 'seated';
  /** 想坐的座位 */
  seat: number;
  boat: Boat | null;
  /** 在码头上站着等的位置 */
  spot: { x: number; z: number };
  /** 船到了以后再过多久上船；跨上船的进度 0–1；刚出现时淡入的进度 0–1 */
  delay: number;
  k: number;
  shown: number;
}

export interface RidePose {
  /** 小人坐在哪、面朝哪 */
  x: number;
  z: number;
  facing: number;
  /** 这一帧船头转了多少（镜头跟着转） */
  turn: number;
  /** 镜头最远能离小人多远，不穿进洞壁 */
  boom: number;
  /** 夜空的底光该有多亮：洞里很暗，出洞时亮回来 */
  ambience: number;
  /** 船已经离开码头了 */
  sailing: boolean;
  /** 快到终点了，该让画面暗下去、换到码头 */
  done: boolean;
}

/** 一个座位：坐在哪、面朝哪、从码头上的哪里跨上去 */
export interface BoatSeat {
  index: number;
  x: number;
  z: number;
  facing: number;
  lift: number;
  exit: { x: number; z: number };
}

/** 一块染好颜色的木板（合并成一条船用） */
function plank(sx: number, sy: number, sz: number, x: number, y: number, z: number, color: number, ry = 0) {
  const g = new THREE.BoxGeometry(sx, sy, sz);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

/**
 * 思念之河的山洞和游船。山洞建在主场景之外很远的地方：一个很大很开阔的洞厅，河从中间流过，
 * 几盏彩色的大灯照着远处的洞壁，水面上漂着河灯，最后从洞口漂到夜空下。
 *
 * 从大厅过来先站在洞壁高处的石台上，沿石阶走下去是码头。船一班接一班：每隔一会儿有一条空船靠上码头，
 * 到点就开，不等坐满；河面上同时有好几条船前后隔着距离一起漂。别的访客（现在是本地模拟的）
 * 也会走下石阶、在码头上等、坐到船上。
 */
export class CaveRide {
  readonly length: number;
  /** 访客在洞里能走动的范围（石台、石阶、码头） */
  readonly room = { minX: V.x + ST.x0 + 0.3, maxX: V.x + ST.x1 - 0.3, minZ: V.z + ST.end + 0.3, maxZ: V.z + ST.top + 0.7 };
  /** 从大厅过来站在哪里：石台上，面向整个洞厅 */
  readonly spawn = { x: V.x + (ST.x0 + ST.x1) / 2, z: V.z + ST.top - 1.1, yaw: 0, pitch: -0.12 };
  /** 「独自参观」时不出现别的访客 */
  solo = false;

  private curve: THREE.CatmullRomCurve3;
  private boats: Boat[] = [];
  private riders: Rider[] = [];
  private batch: AvatarBatch;
  private hidden = defaultPose(0xffffff);
  private lamps: Lamp[] = [];
  /** 自己坐在哪条船的哪个座位上 */
  private mine: { boat: Boat; seat: number } | null = null;
  /** 离下一班开船还有多久 */
  private timer = 0;
  private active = false;
  private rnd = mulberry32(977);
  private p = new THREE.Vector3();
  private t = new THREE.Vector3();

  constructor(private world: World) {
    this.curve = new THREE.CatmullRomCurve3(
      V.path.map(([x, z]) => new THREE.Vector3(V.x + x, 0, V.z + z)),
      false,
      'centripetal',
    );
    this.curve.arcLengthDivisions = 600;
    this.length = this.curve.getLength();
    this.buildCave();
    this.buildStation();
    this.buildBoats();
    this.hidden.scale = 0;
    this.batch = new AvatarBatch(world.scene, B.count * 3 + 6);
    this.batch.visible = false;
    // 船头的灯：只给离访客最近的几条船
    for (let i = 0; i < 3; i++) this.lamps.push(world.pointLight(V.x, 1.1, V.z, 0, 8));
  }

  /** 河道上走了 s 米处的位置（写进 p）和前进方向（写进 t） */
  private frame(s: number) {
    const u = THREE.MathUtils.clamp(s / this.length, 0, 1);
    this.curve.getPointAt(u, this.p);
    this.curve.getTangentAt(u, this.t).setY(0).normalize();
    // 起点之前、终点之后沿着直线延伸
    if (s < 0) this.p.addScaledVector(this.t, s);
    else if (s > this.length) this.p.addScaledVector(this.t, s - this.length);
  }

  private R(a: number, b: number) {
    return a + this.rnd() * (b - a);
  }

  // ---------- 进出山洞 ----------

  /** 访客来到洞里：河面上已经有几条船在漂，码头边停着一条，也许还有人在等 */
  start() {
    this.active = true;
    this.mine = null;
    this.riders = [];
    this.batch.visible = true;
    const gap = B.interval * V.speed;
    this.boats.forEach((b, i) => {
      b.riders.fill(null);
      const s = B.moor + i * gap;
      if (i === 0) this.setState(b, 'moored', B.moor);
      else if (s < this.length + VANISH - 2) {
        this.setState(b, 'sailing', s);
        if (!this.solo) for (const seat of this.pickSeats(b)) this.seatRider(this.newRider(seat), b);
      } else this.setState(b, 'idle', APPEAR);
    });
    this.timer = this.R(B.interval * 0.45, B.interval * 0.8);
    // 已经在码头上等着的人
    this.gather(true);
    this.advance(0, 0);
  }

  stop() {
    this.active = false;
    this.mine = null;
    this.riders = [];
    this.batch.visible = false;
    for (const b of this.boats) b.group.visible = false;
    for (const l of this.lamps) l.intensity = 0;
  }

  /** 访客是不是走进了石台后面通往大厅的门洞 */
  inPortal(x: number, z: number) {
    return z - V.z > ST.top + 0.3 && Math.abs(x - V.x - (ST.x0 + ST.x1) / 2) < (ST.x1 - ST.x0) / 2;
  }

  // ---------- 自己上船 ----------

  private docked() {
    return this.boats.find((b) => b.state === 'moored') ?? null;
  }

  private free(b: Boat, seat: number) {
    return !b.riders[seat] && !(this.mine?.boat === b && this.mine.seat === seat);
  }

  /** 停在码头边的船上，离第 want 个座位最近的空座；没有船或者坐满了就是 null */
  seatNear(want: number): BoatSeat | null {
    const b = this.docked();
    if (!b) return null;
    const d = (i: number) => Math.hypot(SEATS[i][0] - SEATS[want][0], SEATS[i][1] - SEATS[want][1]);
    const index = SEATS.map((_, i) => i).filter((i) => this.free(b, i)).sort((i, j) => d(i) - d(j))[0];
    if (index === undefined) return null;
    const [x, z] = this.seatAt(b, index);
    return { index, x, z, facing: b.facing, lift: SEAT_LIFT, exit: { x: V.x + ST.x0 + 0.4, z } };
  }

  /** 坐到这个座位上；船刚好开走了或者被别人坐了就返回 false */
  claim(seat: number) {
    const b = this.docked();
    if (!b || !this.free(b, seat)) return false;
    this.mine = { boat: b, seat };
    this.lastFacing = b.facing;
    return true;
  }

  /** 船还没开，自己又站起来了 */
  release() {
    this.mine = null;
  }

  // ---------- 每一帧 ----------

  /**
   * 船和同乘的访客往前走一点。自己坐在船上时，返回小人和镜头这一帧该在哪。
   * who 是访客现在的位置（船头的灯只点离得近的几条）。
   */
  update(dt: number, t: number, who: THREE.Vector3): RidePose | null {
    if (!this.active) return null;
    this.advance(dt, t);

    const near = this.boats.filter((b) => b.state !== 'idle').sort((a, b) => Math.hypot(a.x - who.x, a.z - who.z) - Math.hypot(b.x - who.x, b.z - who.z));
    this.lamps.forEach((lamp, i) => {
      const b = near[i];
      lamp.intensity = b ? 12 * b.fade : 0;
      if (b) lamp.pos.set(b.x - Math.sin(b.facing) * 3.3, 1.1, b.z - Math.cos(b.facing) * 3.3);
    });

    const me = this.mine;
    if (!me) return null;
    const { boat } = me;
    const facing = boat.facing;
    const [x, z] = this.seatAt(boat, me.seat);
    const turn = Math.atan2(Math.sin(facing - this.lastFacing), Math.cos(facing - this.lastFacing));
    this.lastFacing = facing;
    return {
      x,
      z,
      facing,
      turn: boat.state === 'sailing' ? turn : 0,
      boom: profileAt(boat.s).half,
      ambience: V.ambience + (1 - V.ambience) * THREE.MathUtils.smoothstep(boat.s, OPEN_AT - 8, OPEN_AT + 6),
      sailing: boat.state === 'sailing',
      done: boat.s >= this.length - V.fadeOut,
    };
  }
  private lastFacing = 0;

  private advance(dt: number, t: number) {
    // 码头边没有船：叫一条空船过来
    if (!this.boats.some((b) => b.state === 'arriving' || b.state === 'moored')) {
      const b = this.boats.find((k) => k.state === 'idle');
      if (b) this.setState(b, 'arriving', APPEAR);
    }
    this.timer -= dt;
    for (const b of this.boats) {
      if (b.state === 'arriving') {
        // 靠岸时慢下来
        b.s = Math.min(B.moor, b.s + Math.min(1.8, Math.max(0.25, (B.moor - b.s) * 0.7)) * dt);
        if (b.s >= B.moor - 0.01) {
          b.state = 'moored';
          for (const r of this.riders) if (r.state === 'wait') r.delay = this.R(0.6, 5);
        }
      } else if (b.state === 'moored') {
        // 到点就开，不等坐满
        if (this.timer <= 0) {
          b.state = 'sailing';
          this.timer = B.interval;
          this.gather(false);
        }
      } else if (b.state === 'sailing') {
        b.s += V.speed * dt;
        if (b.s > this.length + VANISH) {
          this.riders = this.riders.filter((r) => r.boat !== b);
          b.riders.fill(null);
          if (this.mine?.boat === b) this.mine = null;
          this.setState(b, 'idle', APPEAR);
        }
      }
      this.place(b, t);
    }

    const docked = this.docked();
    for (const r of this.riders) this.moveRider(r, docked, dt);
    for (let i = 0; i < this.batch.count; i++) this.batch.set(i, this.solo ? this.hidden : (this.riders[i]?.pose ?? this.hidden), t);
    this.batch.commit();
  }

  private setState(b: Boat, state: BoatState, s: number) {
    b.state = state;
    b.s = s;
    this.place(b, 0);
  }

  /** 把船摆到它在河道上的位置；刚出现和快消失时是半透明的 */
  private place(b: Boat, t: number) {
    this.frame(b.s);
    b.x = this.p.x;
    b.z = this.p.z;
    b.facing = Math.atan2(-this.t.x, -this.t.z);
    b.fade = b.state === 'idle' ? 0 : THREE.MathUtils.smoothstep(b.s, APPEAR, APPEAR + 4) * (1 - THREE.MathUtils.smoothstep(b.s, this.length + VANISH - 8, this.length + VANISH));
    const g = b.group;
    g.visible = this.active && b.fade > 0.01;
    g.position.set(b.x, Math.sin(t * 1.1 + b.bob) * 0.012, b.z);
    g.rotation.set(0, b.facing, Math.sin(t * 0.8 + b.bob) * 0.01);
    for (const m of b.mats) {
      m.transparent = b.fade < 0.999;
      m.opacity = b.fade;
    }
  }

  /** 这条船上第 i 个座位在哪 */
  private seatAt(b: Boat, i: number): [number, number] {
    const [right, back] = SEATS[i];
    const fx = -Math.sin(b.facing);
    const fz = -Math.cos(b.facing);
    return [b.x - fz * right - fx * back, b.z + fx * right - fz * back];
  }

  // ---------- 同乘的访客 ----------

  /** 给一条船随机挑几个座位 */
  private pickSeats(b: Boat) {
    const n = Math.round(this.R(B.riders[0] - 0.49, B.riders[1] + 0.49));
    const seats = SEATS.map((_, i) => i).filter((i) => this.free(b, i));
    const out: number[] = [];
    while (out.length < n && seats.length) out.push(seats.splice(Math.floor(this.rnd() * seats.length), 1)[0]);
    return out;
  }

  private newRider(seat: number): Rider {
    const colors = CONFIG.visitors.colors;
    const pose = defaultPose(colors[Math.floor(this.rnd() * colors.length)]);
    // 等船的位置：对着自己想坐的那一排；坐里侧的人站得靠后一点
    const spot = { x: V.x + ST.x0 + 0.55 + (seat % 2) * 0.8 + this.R(-0.1, 0.1), z: V.z - B.moor + SEATS[seat][1] + this.R(-0.15, 0.15) };
    const r: Rider = { pose, state: 'wait', seat, boat: null, spot, delay: this.R(0.6, 5), k: 0, shown: 1 };
    this.riders.push(r);
    return r;
  }

  private seatRider(r: Rider, b: Boat) {
    r.state = 'seated';
    r.boat = b;
    r.k = 1;
    b.riders[r.seat] = r;
  }

  /**
   * 凑齐下一班的人：码头上等的人不够时再来几位。
   * here 为 true 时他们已经站在码头上了（访客刚进洞），否则从门洞出来，走下石阶。
   */
  private gather(here: boolean) {
    if (this.solo) return;
    const waiting = this.riders.filter((r) => !r.boat);
    const taken = new Set(waiting.map((r) => r.seat));
    const n = Math.round(this.R(B.riders[0] - 0.49, B.riders[1] + 0.49));
    const seats = SEATS.map((_, i) => i).filter((i) => !taken.has(i));
    for (let k = waiting.length; k < n && seats.length && this.riders.length < this.batch.count; k++) {
      const r = this.newRider(seats.splice(Math.floor(this.rnd() * seats.length), 1)[0]);
      const p = r.pose;
      if (here) {
        p.x = r.spot.x;
        p.z = r.spot.z;
        p.facing = Math.PI / 2;
      } else {
        r.state = 'walk';
        p.x = V.x + this.R(ST.x0 + 0.8, ST.x1 - 0.8);
        p.z = V.z + ST.top + 0.4 + (k - waiting.length) * 1.3;
        r.shown = 0;
      }
      p.y = stationHeight(p.z - V.z);
    }
  }

  private moveRider(r: Rider, docked: Boat | null, dt: number) {
    const p = r.pose;
    const ease = 1 - Math.exp(-dt * 8);
    r.shown = Math.min(1, r.shown + dt / 1.2);
    p.alpha = r.shown * (r.boat ? r.boat.fade : 1);
    if (r.state === 'walk') {
      const dx = r.spot.x - p.x;
      const dz = r.spot.z - p.z;
      const d = Math.hypot(dx, dz);
      const step = Math.min(d, CONFIG.visitors.speed * dt);
      if (d < 0.05) {
        r.state = 'wait';
        r.delay = this.R(0.6, 4);
      } else {
        p.x += (dx / d) * step;
        p.z += (dz / d) * step;
        p.facing = Math.atan2(-dx, -dz);
        p.phase += step * 4.4;
      }
      p.stride += ((d < 0.05 ? 0 : 0.8) - p.stride) * ease;
      p.y += (stationHeight(p.z - V.z) - p.y) * (1 - Math.exp(-dt * 12));
    } else if (r.state === 'wait') {
      p.stride += (0 - p.stride) * ease;
      // 面向河面等船
      p.facing += Math.atan2(Math.sin(Math.PI / 2 - p.facing), Math.cos(Math.PI / 2 - p.facing)) * ease * 0.5;
      if (!docked) return;
      r.delay -= dt;
      if (r.delay > 0) return;
      // 想坐的座位被占了就换一个空的；坐满了就等下一班
      const seat = this.free(docked, r.seat) ? r.seat : SEATS.map((_, i) => i).find((i) => this.free(docked, i));
      if (seat === undefined) return;
      r.seat = seat;
      r.boat = docked;
      r.state = 'hop';
      r.k = 0;
      docked.riders[seat] = r;
    } else if (r.boat) {
      // 跨上船、坐下，之后跟着船走
      r.k = Math.min(1, r.k + dt / 0.7);
      if (r.k >= 1) r.state = 'seated';
      const [sx, sz] = this.seatAt(r.boat, r.seat);
      const k = r.k * r.k * (3 - 2 * r.k);
      p.x = r.spot.x + (sx - r.spot.x) * k;
      p.z = r.spot.z + (sz - r.spot.z) * k;
      p.y = ST.deck + (SEAT_LIFT - ST.deck) * k + (r.state === 'seated' ? r.boat.group.position.y : 0);
      p.sit = k;
      p.stride = 0;
      const to = r.boat.facing;
      p.facing += Math.atan2(Math.sin(to - p.facing), Math.cos(to - p.facing)) * (r.state === 'seated' ? 1 : ease);
    }
  }

  // ---------- 船 ----------

  /** 六个座位的木船，一共 B.count 条轮着用。船头朝 -Z，原点在船的中心 */
  private buildBoats() {
    const C = CONFIG.colors;
    const parts = [plank(1.56, 0.1, 4.4, 0, 0.07, -0.1, C.woodDark), plank(1.72, 0.46, 0.08, 0, 0.3, 2.1, C.wood)];
    for (const s of [-1, 1]) {
      parts.push(plank(0.08, 0.46, 4.4, s * 0.82, 0.3, -0.1, C.wood));
      parts.push(plank(0.1, 0.05, 4.44, s * 0.84, 0.54, -0.1, C.woodLight));
      // 船头两侧向中间收拢的板
      parts.push(plank(0.08, 0.5, 1.22, s * 0.425, 0.31, -2.725, C.wood, s * 0.785));
    }
    for (const [, back] of [SEATS[0], SEATS[2], SEATS[4]]) parts.push(plank(1.6, 0.06, 0.34, 0, BENCH - 0.03, back, C.woodLight));
    // 船头的立柱，上面挑着一盏灯
    parts.push(plank(0.1, 0.8, 0.1, 0, 0.44, -3.15, C.woodDark), plank(0.03, 0.4, 0.03, 0, 1.0, -3.15, C.woodDark));
    const hull = mergeGeometries(parts);
    const lantern = new THREE.BoxGeometry(0.17, 0.22, 0.17).translate(0, 1.08, -3.15);
    for (let i = 0; i < B.count; i++) {
      const wood = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
      const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(C.warm).multiplyScalar(1.5) });
      const group = new THREE.Group();
      group.add(new THREE.Mesh(hull, wood), new THREE.Mesh(lantern, glow));
      group.visible = false;
      this.world.scene.add(group);
      this.boats.push({ group, mats: [wood, glow], s: APPEAR, state: 'idle', riders: SEATS.map(() => null), x: 0, z: 0, facing: 0, fade: 0, bob: i * 1.7 });
    }
    // 停在码头边时，点船上的座位就走过去坐下
    this.frame(B.moor);
    const moored = { x: this.p.x, z: this.p.z, facing: Math.atan2(-this.t.x, -this.t.z) } as Boat;
    SEATS.forEach((_, i) => {
      const [x, z] = this.seatAt(moored, i);
      this.world.proxy(x, 0.75, z, 0.78, 1.1, 1.0, STR.tipBoat, () => this.world.hooks.board(i));
    });
  }

  // ---------- 石台、石阶、码头 ----------

  private buildStation() {
    const w = this.world;
    const { kit } = w;
    const C = CONFIG.colors;
    const stone = [0x77726a, 0x6c6760, 0x827c73];
    const X = (lx: number) => V.x + lx;
    const Z = (lz: number) => V.z + lz;
    const cx = (ST.x0 + ST.x1) / 2;
    const wide = ST.x1 - ST.x0;

    // 地面跟着石台、石阶和码头走
    const outside = w.heightAt;
    w.heightAt = (x, z) => {
      const lx = x - V.x;
      const lz = z - V.z;
      if (lx > ST.x0 - 0.3 && lx < ST.x1 + 0.3 && lz > ST.end - 0.3 && lz < ST.top + 5) return stationHeight(lz);
      return outside(x, z);
    };

    // 石台：一整块石头，一直砌到洞壁里
    const back = ST.top + 4.5;
    kit.box(X(cx), (ST.ledge - 1) / 2, Z((ST.stairs + back) / 2), wide, ST.ledge + 1, back - ST.stairs, stone[0]);
    // 石阶：每一级都从水里砌上来
    for (let k = 1; k <= ST.steps; k++) {
      const top = ST.ledge - k * STEP_RISE;
      kit.box(X(cx), (top - 1) / 2, Z(ST.stairs - (k - 0.5) * STEP_RUN), wide, top + 1, STEP_RUN, stone[k % 3]);
    }
    // 通往大厅的门洞：两根石柱、一根横梁，里面是黑的
    const doorH = 2.9;
    for (const s of [-1, 1]) kit.box(X(cx + s * (wide / 2 - 0.3)), ST.ledge + doorH / 2, Z(ST.top + 0.3), 0.6, doorH, 0.6, stone[1]);
    kit.box(X(cx), ST.ledge + doorH + 0.25, Z(ST.top + 0.3), wide + 0.3, 0.5, 0.7, stone[2]);
    kit.box(X(cx), ST.ledge + doorH / 2 + 0.2, Z(ST.top + 2.7), wide + 0.3, doorH + 0.9, 4.2, 0x050608);
    const sign = textMesh(STR.cinemaExit, { height: 0.26, color: '#ffe2b8', glow: 1.3, maxWidth: wide - 0.6 });
    sign.position.set(X(cx), ST.ledge + doorH + 0.25, Z(ST.top - 0.07));
    sign.rotation.y = Math.PI;
    w.scene.add(sign);
    kit.glowBox(X(cx - wide / 2 + 0.3), ST.ledge + 2.1, Z(ST.top - 0.05), 0.14, 0.2, 0.1, C.warm, 2.2);
    kit.glowBox(X(cx + wide / 2 - 0.3), ST.ledge + 2.1, Z(ST.top - 0.05), 0.14, 0.2, 0.1, C.warm, 2.2);
    w.pointLight(X(cx), ST.ledge + 2.2, Z(ST.top - 1.4), 7, 8);

    // 码头：一块块木板，外侧一排木桩，隔几根挂一盏灯
    const boards = Math.round((ST.foot - ST.end) / 0.65);
    const pitch = (ST.foot - ST.end) / boards;
    for (let i = 0; i < boards; i++) {
      kit.box(X(cx), ST.deck - 0.05, Z(ST.foot - (i + 0.5) * pitch), wide, 0.1, pitch - 0.03, i % 3 === 1 ? C.woodLight : C.wood);
    }
    for (let lz = ST.foot - 0.6, i = 0; lz > ST.end; lz -= 3, i++) {
      for (const lx of [ST.x0 + 0.12, ST.x1 - 0.12]) kit.cyl(X(lx), -0.6, Z(lz), 0.09, ST.deck + 0.55, C.woodDark);
      kit.cyl(X(ST.x1 - 0.12), ST.deck, Z(lz), 0.05, 1.5, C.woodDark);
      kit.glowBox(X(ST.x1 - 0.12), ST.deck + 1.6, Z(lz), 0.16, 0.2, 0.16, C.warm, 2.4);
    }
    w.pointLight(X(cx + 0.8), ST.deck + 2, Z(-B.moor), 9, 11);
  }

  private buildCave() {
    const { kit, scene } = this.world;
    const rnd = mulberry32(8127);
    const R = (a: number, b: number) => a + rnd() * (b - a);
    const pick = (list: number[]) => list[Math.floor(rnd() * list.length)];
    const p = this.p;
    const t = this.t;
    /** 中线上走了 s 米、往右偏 side 米的位置 */
    const at = (s: number, side: number): [number, number] => {
      this.frame(s);
      return [p.x - t.z * side, p.z + t.x * side];
    };
    const size = V.rock;
    const rock = (x: number, y: number, z: number, k = 1) =>
      kit.ball(x, y, z, size * k * R(0.85, 1.2), pick(COL.rocks), R(0.7, 1.1), R(0, 6));

    // 水面：一整块，盖住整条河道
    const xs = V.path.map((q) => q[0]);
    const zs = V.path.map((q) => q[1]);
    const pad = 110;
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(Math.max(...xs) - Math.min(...xs) + pad * 2, Math.max(...zs) - Math.min(...zs) + pad * 2).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: COL.water, roughness: 0.5, metalness: 0 }),
    );
    water.position.set(V.x + (Math.max(...xs) + Math.min(...xs)) / 2, 0, V.z + (Math.max(...zs) + Math.min(...zs)) / 2);
    scene.add(water);

    // 洞壁和洞顶：一整张粗糙的大面片。横截面是半个椭圆，每个顶点往里外随机挪一点，显出岩石的棱面
    const SEG = 14;
    const gap = size * 0.9;
    const s0 = -gap * 2;
    const pos: number[] = [];
    let rings = 0;
    for (let s = s0; s < OPEN_AT + gap; s += gap, rings++) {
      const { half, ceil } = profileAt(Math.min(s, OPEN_AT - 1));
      for (let i = 0; i <= SEG; i++) {
        const th = (i / SEG) * Math.PI;
        const k = 1 + R(-0.09, 0.09);
        const [x, z] = at(s + R(-1.6, 1.6), half * k * Math.cos(th));
        // 贴着水面的一圈埋到水下一点，水边不留缝
        pos.push(x, i === 0 || i === SEG ? -1 : ceil * k * Math.sin(th), z);
      }
    }
    const index: number[] = [];
    for (let r = 0; r < rings - 1; r++) {
      for (let i = 0; i < SEG; i++) {
        const k = r * (SEG + 1) + i;
        // 相邻的格子对角线交替着切，棱面不排成一条条的
        if ((r + i) % 2) index.push(k, k + 1, k + SEG + 1, k + 1, k + SEG + 2, k + SEG + 1);
        else index.push(k, k + 1, k + SEG + 2, k, k + SEG + 2, k + SEG + 1);
      }
    }
    // 起点后面封住，回头看是一面石壁
    const [cx, cz] = at(s0 - 4, 0);
    pos.push(cx, profileAt(s0).ceil * 0.4, cz);
    for (let i = 0; i < SEG; i++) index.push(rings * (SEG + 1), i, i + 1);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(index);
    const shell = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({ color: COL.wall, roughness: 0.95, metalness: 0, flatShading: true, side: THREE.DoubleSide }),
    );
    shell.frustumCulled = false;
    scene.add(shell);

    // 水边零星的几块大石头
    for (let s = 0; s < OPEN_AT - 6; s += R(9, 16)) {
      const { half } = profileAt(s);
      const [x, z] = at(s, (rnd() < 0.5 ? -1 : 1) * half * R(0.86, 0.97));
      rock(x, R(-1, 0.5), z, R(0.35, 0.6));
    }

    // 洞口外面的山：一面石壁，中间留出洞口，轮廓往两边低下去
    {
      const { half, ceil } = profileAt(OPEN_AT - 1);
      const span = half + 46;
      const peak = ceil + 26;
      for (let y = 0; y < peak; y += size * 0.95) {
        for (let l = -span; l <= span; l += size * 0.95) {
          if ((l / half) ** 2 + (y / ceil) ** 2 < 1) continue;
          if (y > peak * (1 - (l / span) ** 2)) continue;
          const [x, z] = at(OPEN_AT + 6 + R(-1.5, 1.5), l + R(-1, 1));
          rock(x, y + R(-1, 1), z);
        }
      }
    }

    // 出洞之后：两岸是低矮的石头
    for (let s = OPEN_AT + 5; s < this.length + 24; s += 4.5) {
      const { half } = profileAt(s);
      for (const side of [-1, 1]) {
        const [x, z] = at(s + R(-1, 1), side * (half + R(0, 2.5)));
        rock(x, 0, z, R(0.22, 0.42));
      }
    }

    // 照洞壁的大灯
    for (const [s, side, y, color, intensity] of LIGHTS) {
      const [x, z] = at(s, side);
      this.world.pointLight(x, y, z, intensity, 75, color).reach = V.lightReach;
    }

    // 水面上漂着的河灯：洞里稀疏的一片，洞口外也有，和码头那条河接上
    const C = CONFIG.colors;
    for (let i = 0; i < 70; i++) {
      const s = R(4, this.length + 14);
      const { half } = profileAt(s);
      const [x, z] = at(s, (rnd() < 0.5 ? -1 : 1) * R(2.2, half * 0.72));
      kit.box(x, 0.03, z, 0.26, 0.04, 0.26, C.woodLight, R(0, 3));
      kit.glowBox(x, 0.13, z, 0.16, 0.17, 0.16, C.warm, 2.4, R(0, 3));
      kit.pool(x, z, 1.5, C.warm, 0.22, 0.03);
    }
    // 洞口外两岸的几棵树
    for (let i = 0; i < 14; i++) {
      const s = R(OPEN_AT + 8, this.length + 26);
      const { half } = profileAt(s);
      const [x, z] = at(s, (i % 2 ? -1 : 1) * (half + R(5, 18)));
      const k = R(0.9, 1.6);
      const g = [0x2f6b4a, 0x3a7a52, 0x27603f][i % 3];
      kit.cyl(x, 0, z, 0.2 * k, 1.6 * k, 0x5b4332);
      kit.cone(x, 1.2 * k, z, 1.7 * k, 2.4 * k, g, R(0, 6));
      kit.cone(x, 2.5 * k, z, 1.35 * k, 2.1 * k, g, R(0, 6));
      kit.cone(x, 3.7 * k, z, 0.95 * k, 1.8 * k, g, R(0, 6));
    }
  }
}
