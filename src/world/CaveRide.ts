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

/** 颜色：洞壁是偏浅的石灰岩色（暖色的灯打上去是温的） */
const COL = {
  wall: 0x8a8279,
  rocks: [0x7b746c, 0x716b64, 0x676159],
  water: 0x08202c,
};

/** 沿途的灯用到的颜色：都是灯笼和烛火那样的暖色，中段和靠近洞口的地方带一点淡淡的月光 */
const HUE = {
  amber: 0xffa850,
  honey: 0xffc070,
  ember: 0xff9058,
  candle: 0xffd9a0,
  moon: 0xa8b8d8,
  /** 更淡的月光：洞厅中段的洞顶和一侧洞壁，免得一路都是橙色 */
  pale: 0xc6d0e6,
};

/**
 * 照洞壁和洞顶的大灯：在河道上走了多远的地方、偏离中线多少（正数在右手边）、多高、颜色、亮度。
 * 灯本身看不见。洞厅很宽，灯挂得高、离洞壁远：洞壁和水面上只落下很淡的一层光，不会照出一块块亮斑。
 */
type Light = [s: number, side: number, y: number, color: number, intensity: number];
const LIGHTS: Light[] = [
  [6, -17, 17, HUE.amber, 150],
  [26, 22, 18, HUE.honey, 120],
  [46, -23, 18, HUE.ember, 120],
  [56, 2, 30, HUE.pale, 70],
  [66, 23, 18, HUE.pale, 90],
  [84, -22, 18, HUE.honey, 110],
  [98, 14, 10, HUE.moon, 90],
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
 * 上船的地方（一共两处，样子相同）：高处一个石台，后面是通往外面的门洞；一段石阶往下，下面是贴着河道的木码头。
 * 三段在一条直线上，宽度相同。下面的尺寸是沿着这条直线量的：0 附近是石阶的中段，正数朝门洞，负数朝码头的尽头。
 */
const ST = {
  wide: 3.9,
  /** 石台后沿（门洞）、石阶从哪里开始往下、石阶的脚、码头的尽头 */
  top: 9.5,
  stairs: 5,
  foot: -3,
  end: -16,
  steps: 16,
  ledge: V.station.ledge,
  deck: V.station.deck,
  /** 船停在码头的哪一段 */
  moor: -B.moor,
};
const STEP_RUN = (ST.stairs - ST.foot) / ST.steps;
const STEP_RISE = (ST.ledge - ST.deck) / ST.steps;

/** 船的半宽，和船帮离码头边多远 */
const BOAT_HALF = 0.85;
const GAP = 0.25;
/** 两条航道的中线离河道中线多远：出洞的船走中线，进洞的船在它右手边，中间正好夹着洞里的码头 */
const LANE_OUT = 0;
const LANE_IN = (BOAT_HALF + GAP) * 2 + ST.wide;

interface Station {
  /** 这一条的西边沿（x 小的一侧，船都靠在这一侧上人）、东边沿 */
  x0: number;
  x1: number;
  /** 沿线量的 0 在哪（z），以及正数朝 +z 还是 -z */
  oz: number;
  dir: 1 | -1;
  /** 访客能走动的范围 */
  room: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** 从外面进来站在哪里：石台上，面向石阶 */
  spawn: { x: number; z: number; yaw: number; pitch: number };
}

function station(x0: number, oz: number, dir: 1 | -1): Station {
  const x1 = x0 + ST.wide;
  const za = oz + (ST.end + 0.3) * dir;
  const zb = oz + (ST.top + 0.7) * dir;
  return {
    x0, x1, oz, dir,
    room: { minX: x0 + 0.3, maxX: x1 - 0.3, minZ: Math.min(za, zb), maxZ: Math.max(za, zb) },
    spawn: { x: (x0 + x1) / 2, z: oz + (ST.top - 1.1) * dir, yaw: dir > 0 ? 0 : Math.PI, pitch: -0.12 },
  };
}

/** 沿线量的位置 */
const along = (st: Station, z: number) => (z - st.oz) * st.dir;

/** 上船的地方脚下有多高 */
function stationHeight(st: Station, z: number) {
  const l = along(st, z);
  if (l >= ST.stairs) return ST.ledge;
  if (l <= ST.foot) return ST.deck;
  return ST.ledge - Math.ceil((ST.stairs - l) / STEP_RUN) * STEP_RISE;
}

/** 船上的六个座位：相对船的中心，往右多少、往船尾多少 */
const SEATS: Array<[number, number]> = [[0.4, -1.1], [-0.4, -1.1], [0.4, 0], [-0.4, 0], [0.4, 1.1], [-0.4, 1.1]];
const ALL = SEATS.map((_, i) => i);
/** 船上横板的高度；坐着时小人比站着高出多少 */
const BENCH = 0.42;
const SEAT_LIFT = BENCH - CONFIG.player.sitHip;
/** 船在河道起点后面多远的地方出现 / 消失（洞壁里） */
const APPEAR = -15;

type BoatState = 'idle' | 'arriving' | 'moored' | 'sailing' | 'landing';

/** 一条航线：船从 from 出现，在 moor 停下上人，开到 to 消失；进洞的船中途在 stop 停一下让人下船 */
interface Line {
  dir: 1 | -1;
  lateral: number;
  from: number;
  to: number;
  moor: number;
  stop: number | null;
  /** 在哪里上船；下船的地方（只有进洞的航线有） */
  board: Station;
  land: Station | null;
  boats: Boat[];
  /** 离下一班开船还有多久 */
  timer: number;
}

interface Boat {
  line: Line;
  group: THREE.Group;
  mats: THREE.Material[];
  s: number;
  state: BoatState;
  /** 已经让人下过船了；靠岸下船还要停多久 */
  landed: boolean;
  wait: number;
  /** 六个座位上坐的是谁（别的访客）；自己坐的座位记在 mine 里 */
  riders: Array<Rider | null>;
  x: number;
  z: number;
  facing: number;
  fade: number;
  bob: number;
}

/**
 * 一位同乘的访客：从门洞出来走下石阶（walk），在码头上等船（wait），船到了跨上去（hop）坐着（seated）跟船走；
 * 进洞的船靠岸后跨下船（off），走上石阶，从门洞出去（away）。
 */
interface Rider {
  pose: AvatarPose;
  state: 'walk' | 'wait' | 'hop' | 'seated' | 'off' | 'away';
  line: Line;
  /** 想坐的座位 */
  seat: number;
  boat: Boat | null;
  /** 在码头上站的位置（等船时、下船后） */
  spot: { x: number; z: number };
  /** 再过多久上船 / 下船；跨上船的进度 0–1；淡入淡出的进度 0–1 */
  delay: number;
  k: number;
  shown: number;
  gone: boolean;
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
  /** 夜空的底光该有多亮：洞里很暗，洞外是亮的 */
  ambience: number;
  /** 船已经离开码头了 */
  sailing: boolean;
  /** 出洞的船快到终点了，该让画面暗下去、换到室外的码头 */
  done: boolean;
}

/** 一个座位：坐在哪、面朝哪、从码头上的哪里跨上去 */
export interface BoatSeat {
  /** 哪条航线的哪个座位（航线序号 × 6 + 座位号） */
  code: number;
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
 * 几盏暖色的大灯照着远处的洞壁，水面上漂着河灯，洞口外是夜空下的河面。
 *
 * 河上有两处上船的地方，样子相同：洞里最深处的一处通往大厅（inner），洞口外的一处通往大门（outer）。
 * 两条航线方向相反：出洞的船从洞里的码头开到洞外，进洞的船从洞外的码头开进来，靠上洞里的码头让人下船。
 * 船一班接一班：每隔一会儿有一条空船靠上码头，到点就开，不等坐满。别的访客（现在是本地模拟的）
 * 也会走下石阶、在码头上等、坐到船上。
 */
export class CaveRide {
  readonly length: number;
  /** 洞里的码头（通往大厅）和洞口外的码头（通往大门） */
  readonly inner: Station;
  readonly outer: Station;
  /** 「独自参观」时不出现别的访客 */
  solo = false;

  private curve: THREE.CatmullRomCurve3;
  private lines: Line[] = [];
  private riders: Rider[] = [];
  private batch: AvatarBatch;
  private hidden = defaultPose(0xffffff);
  private lamps: Lamp[] = [];
  /** 自己坐在哪条船的哪个座位上 */
  private mine: { boat: Boat; seat: number } | null = null;
  /** 自己坐的船刚靠岸：该从哪里下船 */
  private arrival: { x: number; z: number } | null = null;
  /** 出洞的船开到哪里，画面就该暗下去了 */
  private outEnd: number;
  private lastFacing = 0;
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
    this.curve.arcLengthDivisions = 800;
    this.length = this.curve.getLength();

    // 洞里的码头夹在两条航道之间；洞口外的码头在进洞那条航道的外侧，河道在那里是笔直的
    const [ox, oz] = V.path[V.path.length - 2];
    this.inner = station(V.x + LANE_OUT + BOAT_HALF + GAP, V.z, 1);
    this.outer = station(V.x + ox + LANE_IN + BOAT_HALF + GAP, V.z + oz + ST.moor, -1);
    // 洞口外的船停在河道上多远的地方：沿河道找到和码头对齐的那一点
    let lo = 0;
    let hi = this.length;
    for (let i = 0; i < 40; i++) {
      const s = (lo + hi) / 2;
      this.frame(s, 0);
      if (this.p.z > V.z + oz) lo = s;
      else hi = s;
    }
    const outMoor = (lo + hi) / 2;
    this.outEnd = outMoor - 12;
    const far = this.length - 3;
    this.lines = [
      { dir: 1, lateral: LANE_OUT, from: APPEAR, to: far, moor: B.moor, stop: null, board: this.inner, land: null, boats: [], timer: 0 },
      // 进洞的空船从外码头后面不远的夜色里出现：太远的话一班的时间里划不到码头
      { dir: -1, lateral: LANE_IN, from: Math.min(far, outMoor + 24), to: APPEAR, moor: outMoor, stop: B.moor, board: this.outer, land: this.inner, boats: [], timer: 0 },
    ];

    this.buildCave();
    this.buildStation(this.inner, STR.cinemaExit);
    this.buildStation(this.outer, STR.caveGate);
    this.buildBoats();
    this.hidden.scale = 0;
    this.batch = new AvatarBatch(world.scene, this.lines.length * (B.count * 3 + 6));
    this.batch.visible = false;
    // 船头的灯：只给离访客最近的几条船
    for (let i = 0; i < 3; i++) this.lamps.push(world.pointLight(V.x, 1.1, V.z, 0, 8));
  }

  /** 河道上走了 s 米、往右偏 lateral 米处的位置（写进 p）和河道的方向（写进 t） */
  private frame(s: number, lateral: number) {
    const u = THREE.MathUtils.clamp(s / this.length, 0, 1);
    this.curve.getPointAt(u, this.p);
    this.curve.getTangentAt(u, this.t).setY(0).normalize();
    // 起点之前、终点之后沿着直线延伸
    if (s < 0) this.p.addScaledVector(this.t, s);
    else if (s > this.length) this.p.addScaledVector(this.t, s - this.length);
    this.p.x -= this.t.z * lateral;
    this.p.z += this.t.x * lateral;
  }

  private R(a: number, b: number) {
    return a + this.rnd() * (b - a);
  }

  // ---------- 进出山洞 ----------

  /** 访客来到河边：河面上已经有船在漂，两处码头边各停着一条，也有人在等 */
  start() {
    this.active = true;
    this.mine = null;
    this.arrival = null;
    this.riders = [];
    this.batch.visible = true;
    const gap = B.interval * V.speed;
    for (const line of this.lines) {
      line.boats.forEach((b, i) => {
        b.riders.fill(null);
        b.landed = false;
        const s = line.moor + line.dir * i * gap;
        if (i === 0) this.setState(b, 'moored', line.moor);
        else if ((line.to - s) * line.dir > 10) {
          this.setState(b, 'sailing', s);
          // 已经过了下船的地方：是一条空船
          b.landed = line.stop !== null && (line.stop - s) * line.dir < 0;
          if (!this.solo && !b.landed) for (const seat of this.pickSeats(b)) this.seatRider(this.newRider(line, seat), b);
        } else this.setState(b, 'idle', line.from);
      });
      line.timer = this.R(B.interval * 0.4, B.interval * 0.9);
      // 已经在码头上等着的人
      this.gather(line, true);
    }
    this.advance(0, 0);
  }

  stop() {
    this.active = false;
    this.mine = null;
    this.arrival = null;
    this.riders = [];
    this.batch.visible = false;
    for (const line of this.lines) for (const b of line.boats) b.group.visible = false;
    for (const l of this.lamps) l.intensity = 0;
  }

  /** 访客是不是走进了哪个石台后面的门洞：通往大厅的，还是通往大门的 */
  portalAt(x: number, z: number): 'lobby' | 'gate' | null {
    const inside = (st: Station) => along(st, z) > ST.top + 0.3 && x > st.x0 && x < st.x1;
    return inside(this.inner) ? 'lobby' : inside(this.outer) ? 'gate' : null;
  }

  // ---------- 自己上船、下船 ----------

  private docked(line: Line) {
    return line.boats.find((b) => b.state === 'moored') ?? null;
  }

  private free(b: Boat, seat: number) {
    return !b.riders[seat] && !(this.mine?.boat === b && this.mine.seat === seat);
  }

  /** 停在码头边的船上，离想坐的座位最近的空座；没有船或者坐满了就是 null */
  seatNear(code: number): BoatSeat | null {
    const li = Math.floor(code / SEATS.length);
    const want = code % SEATS.length;
    const b = this.docked(this.lines[li]);
    if (!b) return null;
    const d = (i: number) => Math.hypot(SEATS[i][0] - SEATS[want][0], SEATS[i][1] - SEATS[want][1]);
    const seat = ALL.filter((i) => this.free(b, i)).sort((i, j) => d(i) - d(j))[0];
    if (seat === undefined) return null;
    const [x, z] = this.seatAt(b, seat);
    return { code: li * SEATS.length + seat, x, z, facing: b.facing, lift: SEAT_LIFT, exit: { x: b.line.board.x0 + 0.4, z } };
  }

  /** 坐到这个座位上；船刚好开走了或者被别人坐了就返回 false */
  claim(code: number) {
    const b = this.docked(this.lines[Math.floor(code / SEATS.length)]);
    const seat = code % SEATS.length;
    if (!b || !this.free(b, seat)) return false;
    this.mine = { boat: b, seat };
    this.lastFacing = b.facing;
    return true;
  }

  /** 船还没开，自己又站起来了 */
  release() {
    this.mine = null;
  }

  /** 自己坐的船刚靠上洞里的码头：返回该从码头上的哪里下船（只返回一次） */
  takeArrival() {
    const a = this.arrival;
    this.arrival = null;
    return a;
  }

  // ---------- 每一帧 ----------

  /**
   * 船和同乘的访客往前走一点。自己坐在船上时，返回小人和镜头这一帧该在哪。
   * who 是访客现在的位置（船头的灯只点离得近的几条）。
   */
  update(dt: number, t: number, who: THREE.Vector3): RidePose | null {
    if (!this.active) return null;
    this.advance(dt, t);

    const d = (b: Boat) => Math.hypot(b.x - who.x, b.z - who.z);
    const near = this.lines.flatMap((l) => l.boats).filter((b) => b.state !== 'idle').sort((a, b) => d(a) - d(b));
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
    const sailing = boat.state === 'sailing';
    return {
      x,
      z,
      facing,
      turn: sailing ? turn : 0,
      boom: profileAt(boat.s).half,
      ambience: this.ambienceAt(boat.s),
      sailing,
      done: boat.line.stop === null && boat.s >= this.outEnd,
    };
  }

  /** 河道上走了 s 米的地方，夜空的底光有多亮 */
  private ambienceAt(s: number) {
    return V.ambience + (1 - V.ambience) * THREE.MathUtils.smoothstep(s, OPEN_AT - 8, OPEN_AT + 6);
  }

  /** 访客站在这个码头上时，夜空的底光有多亮 */
  ambienceOn(where: 'lobby' | 'gate') {
    return where === 'lobby' ? V.ambience : 1;
  }

  private advance(dt: number, t: number) {
    for (const line of this.lines) {
      const { dir } = line;
      // 码头边没有船：叫一条空船过来
      if (!line.boats.some((b) => b.state === 'arriving' || b.state === 'moored')) {
        const b = line.boats.find((k) => k.state === 'idle');
        if (b) {
          b.landed = false;
          this.setState(b, 'arriving', line.from);
        }
      }
      line.timer -= dt;
      for (const b of line.boats) {
        /** 朝 target 走，快到时慢下来；到了就返回 true */
        const ease = (target: number, top: number) => {
          const left = (target - b.s) * dir;
          b.s += dir * Math.min(left, Math.min(top, Math.max(0.25, left * 0.6)) * dt);
          return left < 0.02;
        };
        if (b.state === 'arriving') {
          if (ease(line.moor, 1.8)) {
            b.state = 'moored';
            for (const r of this.riders) if (r.line === line && r.state === 'wait') r.delay = this.R(0.6, 6);
          }
        } else if (b.state === 'moored') {
          // 到点就开，不等坐满
          if (line.timer <= 0) {
            b.state = 'sailing';
            line.timer = B.interval;
            this.gather(line, false);
          }
        } else if (b.state === 'sailing') {
          if (line.stop !== null && !b.landed) {
            // 靠上洞里的码头，让人下船
            if (ease(line.stop, V.speed)) this.land(b);
          } else b.s += dir * V.speed * dt;
          if ((line.to - b.s) * dir <= 0) {
            for (const r of this.riders) if (r.boat === b) r.gone = true;
            b.riders.fill(null);
            if (this.mine?.boat === b) this.mine = null;
            this.setState(b, 'idle', line.from);
          }
        } else if (b.state === 'landing') {
          b.wait -= dt;
          if (b.wait <= 0) {
            b.landed = true;
            b.state = 'sailing';
          }
        }
        this.place(b, t);
      }
    }

    for (const r of this.riders) this.moveRider(r, dt);
    this.riders = this.riders.filter((r) => !r.gone);
    for (let i = 0; i < this.batch.count; i++) this.batch.set(i, this.solo ? this.hidden : (this.riders[i]?.pose ?? this.hidden), t);
    this.batch.commit();
  }

  /** 进洞的船靠岸了：船上的人陆续下船，自己也该下船了 */
  private land(b: Boat) {
    const st = b.line.land!;
    b.state = 'landing';
    b.wait = B.unload;
    /** 这个座位对着的码头上的位置；坐外侧的人站得靠里一点，给后面的人让路 */
    const spot = (seat: number, inset: number) => {
      const [x, z] = this.seatAt(b, seat);
      return { x: st.x1 - inset - (x > b.x ? 0.8 : 0), z };
    };
    b.riders.forEach((r, seat) => {
      if (!r) return;
      r.state = 'off';
      r.delay = this.R(0.4, 3.5);
      r.spot = spot(seat, 0.55);
      b.riders[seat] = null;
    });
    if (this.mine?.boat === b) {
      this.arrival = spot(this.mine.seat, 0.4);
      this.mine = null;
    }
  }

  private setState(b: Boat, state: BoatState, s: number) {
    b.state = state;
    b.s = s;
    this.place(b, 0);
  }

  /** 把船摆到它在河道上的位置；刚出现和快消失时是半透明的 */
  private place(b: Boat, t: number) {
    const { line } = b;
    this.frame(b.s, line.lateral);
    b.x = this.p.x;
    b.z = this.p.z;
    b.facing = Math.atan2(-this.t.x * line.dir, -this.t.z * line.dir);
    b.fade = b.state === 'idle' ? 0 : THREE.MathUtils.smoothstep((b.s - line.from) * line.dir, 0, 4) * THREE.MathUtils.smoothstep((line.to - b.s) * line.dir, 0, 8);
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
  private seatAt(b: { x: number; z: number; facing: number }, i: number): [number, number] {
    const [right, back] = SEATS[i];
    const fx = -Math.sin(b.facing);
    const fz = -Math.cos(b.facing);
    return [b.x - fz * right - fx * back, b.z + fx * right - fz * back];
  }

  /** 船停在这条航线的码头边时的位置和朝向 */
  private mooring(line: Line) {
    this.frame(line.moor, line.lateral);
    return { x: this.p.x, z: this.p.z, facing: Math.atan2(-this.t.x * line.dir, -this.t.z * line.dir) };
  }

  // ---------- 同乘的访客 ----------

  private count() {
    return Math.round(this.R(B.riders[0] - 0.49, B.riders[1] + 0.49));
  }

  /** 给一条船随机挑几个座位 */
  private pickSeats(b: Boat) {
    const n = this.count();
    const seats = ALL.filter((i) => this.free(b, i));
    const out: number[] = [];
    while (out.length < n && seats.length) out.push(seats.splice(Math.floor(this.rnd() * seats.length), 1)[0]);
    return out;
  }

  private newRider(line: Line, seat: number): Rider {
    const colors = CONFIG.visitors.colors;
    const pose = defaultPose(colors[Math.floor(this.rnd() * colors.length)]);
    // 等船的位置：对着自己想坐的那一排；坐外侧的人站得靠后一点
    const moored = this.mooring(line);
    const [sx, sz] = this.seatAt(moored, seat);
    const spot = { x: line.board.x0 + 0.55 + (sx < moored.x ? 0.8 : 0) + this.R(-0.1, 0.1), z: sz + this.R(-0.15, 0.15) };
    const r: Rider = { pose, state: 'wait', line, seat, boat: null, spot, delay: this.R(2, 9), k: 0, shown: 1, gone: false };
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
   * here 为 true 时他们已经站在码头上了（访客刚到），否则从门洞出来，走下石阶。
   */
  private gather(line: Line, here: boolean) {
    if (this.solo) return;
    const st = line.board;
    const waiting = this.riders.filter((r) => r.line === line && (r.state === 'walk' || r.state === 'wait'));
    const taken = new Set(waiting.map((r) => r.seat));
    const n = this.count();
    const seats = ALL.filter((i) => !taken.has(i));
    for (let k = waiting.length; k < n && seats.length && this.riders.length < this.batch.count; k++) {
      const r = this.newRider(line, seats.splice(Math.floor(this.rnd() * seats.length), 1)[0]);
      const p = r.pose;
      if (here) {
        p.x = r.spot.x;
        p.z = r.spot.z;
        p.facing = Math.PI / 2;
      } else {
        r.state = 'walk';
        r.shown = 0;
        p.x = this.R(st.x0 + 0.8, st.x1 - 0.8);
        p.z = st.oz + (ST.top + 0.4 + (k - waiting.length) * 1.3) * st.dir;
      }
      p.y = stationHeight(st, p.z);
    }
  }

  /** 朝 (x, z) 走一步，脚下跟着这个码头的高低；到了就返回 true */
  private walk(r: Rider, st: Station, x: number, z: number, dt: number) {
    const p = r.pose;
    const dx = x - p.x;
    const dz = z - p.z;
    const d = Math.hypot(dx, dz);
    const here = d < 0.05;
    if (!here) {
      const step = Math.min(d, CONFIG.visitors.speed * dt);
      p.x += (dx / d) * step;
      p.z += (dz / d) * step;
      p.facing = Math.atan2(-dx, -dz);
      p.phase += step * 4.4;
    }
    p.stride += ((here ? 0 : 0.8) - p.stride) * (1 - Math.exp(-dt * 8));
    p.y += (stationHeight(st, p.z) - p.y) * (1 - Math.exp(-dt * 12));
    return here;
  }

  private moveRider(r: Rider, dt: number) {
    const p = r.pose;
    const ease = 1 - Math.exp(-dt * 8);
    if (r.state !== 'away') r.shown = Math.min(1, r.shown + dt / 1.2);
    p.alpha = r.shown * (r.boat ? r.boat.fade : 1);
    if (r.state === 'walk') {
      if (this.walk(r, r.line.board, r.spot.x, r.spot.z, dt)) {
        r.state = 'wait';
        r.delay = this.R(2, 8);
      }
    } else if (r.state === 'wait') {
      p.stride += (0 - p.stride) * ease;
      // 面向河面等船
      p.facing += Math.atan2(Math.sin(Math.PI / 2 - p.facing), Math.cos(Math.PI / 2 - p.facing)) * ease * 0.5;
      const docked = this.docked(r.line);
      if (!docked) return;
      r.delay -= dt;
      // 快开船了就不再磨蹭
      if (r.delay > 0 && r.line.timer > 2.5) return;
      // 想坐的座位被占了就换一个空的；坐满了就等下一班
      const seat = this.free(docked, r.seat) ? r.seat : ALL.find((i) => this.free(docked, i));
      if (seat === undefined) return;
      r.seat = seat;
      r.boat = docked;
      r.state = 'hop';
      r.k = 0;
      docked.riders[seat] = r;
    } else if (r.state === 'away') {
      // 走上石阶，从门洞出去
      const st = r.line.land!;
      const there = this.walk(r, st, (st.x0 + st.x1) / 2, st.oz + (ST.top + 0.9) * st.dir, dt);
      if (there || along(st, p.z) > ST.top) r.shown -= dt / 0.8;
      p.alpha = Math.max(0, r.shown);
      if (r.shown <= 0) r.gone = true;
    } else if (r.boat) {
      // 跨上船坐下，之后跟着船走；靠岸后等一会儿，再跨下船
      if (r.state === 'off') {
        r.delay -= dt;
        if (r.delay <= 0) r.k = Math.max(0, r.k - dt / 0.7);
      } else {
        r.k = Math.min(1, r.k + dt / 0.7);
        if (r.k >= 1) r.state = 'seated';
      }
      const [sx, sz] = this.seatAt(r.boat, r.seat);
      const k = r.k * r.k * (3 - 2 * r.k);
      p.x = r.spot.x + (sx - r.spot.x) * k;
      p.z = r.spot.z + (sz - r.spot.z) * k;
      p.y = ST.deck + (SEAT_LIFT - ST.deck) * k + (r.state === 'seated' ? r.boat.group.position.y : 0);
      p.sit = k;
      p.stride = 0;
      const to = r.boat.facing;
      p.facing += Math.atan2(Math.sin(to - p.facing), Math.cos(to - p.facing)) * (r.state === 'seated' ? 1 : ease);
      if (r.state === 'off' && r.k <= 0) {
        r.state = 'away';
        r.boat = null;
      }
    }
  }

  // ---------- 船 ----------

  /** 六个座位的木船，每条航线 B.count 条轮着用。船头朝 -Z，原点在船的中心 */
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
    this.lines.forEach((line, li) => {
      for (let i = 0; i < B.count; i++) {
        const wood = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
        const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(C.warm).multiplyScalar(1.5) });
        const group = new THREE.Group();
        group.add(new THREE.Mesh(hull, wood), new THREE.Mesh(lantern, glow));
        group.visible = false;
        this.world.scene.add(group);
        line.boats.push({ line, group, mats: [wood, glow], s: line.from, state: 'idle', landed: false, wait: 0, riders: SEATS.map(() => null), x: 0, z: 0, facing: 0, fade: 0, bob: i * 1.7 + li });
      }
      // 停在码头边时，点船上的座位就走过去坐下
      const moored = this.mooring(line);
      SEATS.forEach((_, i) => {
        const [x, z] = this.seatAt(moored, i);
        this.world.proxy(x, 0.75, z, 0.78, 1.1, 1.0, STR.tipBoat, () => this.world.hooks.board(li * SEATS.length + i));
      });
    });
  }

  // ---------- 石台、石阶、码头 ----------

  /** 搭一处上船的地方；sign 是门洞上写的字（门洞通往哪里） */
  private buildStation(st: Station, signText: string) {
    const w = this.world;
    const { kit } = w;
    const C = CONFIG.colors;
    const stone = [0x77726a, 0x6c6760, 0x827c73];
    const Z = (l: number) => st.oz + l * st.dir;
    const cx = (st.x0 + st.x1) / 2;
    const wide = ST.wide;

    // 地面跟着石台、石阶和码头走
    const outside = w.heightAt;
    w.heightAt = (x, z) => {
      const l = along(st, z);
      if (x > st.x0 - 0.3 && x < st.x1 + 0.3 && l > ST.end - 0.3 && l < ST.top + 5) return stationHeight(st, z);
      return outside(x, z);
    };

    // 石台：一整块石头
    const back = ST.top + 4.5;
    kit.box(cx, (ST.ledge - 1) / 2, Z((ST.stairs + back) / 2), wide, ST.ledge + 1, back - ST.stairs, stone[0]);
    // 石阶：每一级都从水里砌上来
    for (let k = 1; k <= ST.steps; k++) {
      const top = ST.ledge - k * STEP_RISE;
      kit.box(cx, (top - 1) / 2, Z(ST.stairs - (k - 0.5) * STEP_RUN), wide, top + 1, STEP_RUN, stone[k % 3]);
    }
    // 门洞：两根石柱、一根横梁，里面是黑的
    const doorH = 2.9;
    for (const s of [-1, 1]) kit.box(cx + s * (wide / 2 - 0.3), ST.ledge + doorH / 2, Z(ST.top + 0.3), 0.6, doorH, 0.6, stone[1]);
    kit.box(cx, ST.ledge + doorH + 0.25, Z(ST.top + 0.3), wide + 0.3, 0.5, 0.7, stone[2]);
    kit.box(cx, ST.ledge + doorH / 2 + 0.2, Z(ST.top + 2.7), wide + 0.3, doorH + 0.9, 4.2, 0x050608);
    const sign = textMesh(signText, { height: 0.26, color: '#ffe2b8', glow: 1.3, maxWidth: wide - 0.6 });
    sign.position.set(cx, ST.ledge + doorH + 0.25, Z(ST.top - 0.07));
    sign.rotation.y = st.dir > 0 ? Math.PI : 0;
    w.scene.add(sign);
    for (const s of [-1, 1]) kit.glowBox(cx + s * (wide / 2 - 0.3), ST.ledge + 2.1, Z(ST.top - 0.05), 0.14, 0.2, 0.1, C.warm, 2.2);
    // 门口的灯：挂在门楣那一侧、不高，光是从门口横着照出来的，站在石台上的人身上才有光
    // （洞里很暗，灯在头顶正上方的话只照得亮地面，人是一团黑）
    w.pointLight(cx, ST.ledge + 1.9, Z(ST.top - 0.3), 10, 11);

    // 码头：一块块木板，东侧一排木桩，隔几根挂一盏灯
    const boards = Math.round((ST.foot - ST.end) / 0.65);
    const pitch = (ST.foot - ST.end) / boards;
    for (let i = 0; i < boards; i++) {
      kit.box(cx, ST.deck - 0.05, Z(ST.foot - (i + 0.5) * pitch), wide, 0.1, pitch - 0.03, i % 3 === 1 ? C.woodLight : C.wood);
    }
    for (let l = ST.foot - 0.6; l > ST.end; l -= 3) {
      for (const x of [st.x0 + 0.12, st.x1 - 0.12]) kit.cyl(x, -0.6, Z(l), 0.09, ST.deck + 0.55, C.woodDark);
      kit.cyl(st.x1 - 0.12, ST.deck, Z(l), 0.05, 1.5, C.woodDark);
      kit.glowBox(st.x1 - 0.12, ST.deck + 1.6, Z(l), 0.16, 0.2, 0.16, C.warm, 1.7);
    }
    w.pointLight(cx + 0.8, ST.deck + 2, Z(ST.moor), 9, 11);
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
      this.frame(s, side);
      return [p.x, p.z];
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
    // 洞厅很宽，一圈多分几段，棱面才不会大得像一堵堵平墙
    const SEG = 24;
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
    // 水面那条边到中心的一片也要补上，不然从码头回头能看到外面的夜空
    index.push(rings * (SEG + 1), SEG, 0);
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
      const span = half + 34;
      const peak = ceil + 13;
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

    // 洞口外的码头背后：一片从岸边伸出来的石滩，码头就靠在它上面
    {
      const st = this.outer;
      for (let z = st.oz + ST.end * st.dir; z > st.oz + (ST.top + 6) * st.dir; z -= 3.2) {
        for (let x = st.x1 + 4.2; x < st.x1 + 17; x += 3.6) rock(x + R(-0.8, 0.8), R(-0.9, -0.3), z + R(-0.8, 0.8), R(0.3, 0.45));
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
      const side = (rnd() < 0.5 ? -1 : 1) * R(2.2, half * 0.72);
      // 让开两条航道和两处码头
      if (side > 0 && (side < LANE_IN + 2 || (s > this.outEnd && side < LANE_IN + ST.wide + 3))) continue;
      const [x, z] = at(s, side);
      kit.box(x, 0.03, z, 0.26, 0.04, 0.26, C.woodLight, R(0, 3));
      kit.glowBox(x, 0.13, z, 0.16, 0.17, 0.16, C.warm, 2.4, R(0, 3));
      kit.pool(x, z, 1.5, C.warm, 0.22, 0.03);
    }
  }
}
