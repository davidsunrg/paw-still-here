import { CONFIG, RIVER_BANKS, ZONES } from '../config';
import { mulberry32 } from '../data/pets';
import { TREE_POS } from '../world/Memorial';
import { BRIDGE_X, DOCK_X, FIRE_X, pathX } from '../world/Outdoor';
import type { Collider, Seat, World } from '../world/World';
import type { VisitorSource, VisitorState } from './Visitors';

const V = CONFIG.visitors;
/** 坐下 / 起身的时长（秒） */
const SIT_TIME = 1.1;
/** 小人坐着时臀部比基准高度高多少（和 Avatar 里的坐姿对应） */
const SIT_HIP = 0.42;

interface Node {
  x: number;
  z: number;
  links: number[];
}

/** 一个可以停留的地方：站着看，或者坐下 */
interface Spot {
  /** 走到哪个路点算是到了 */
  node: number;
  facing: number;
  bowed: boolean;
  seat: Seat | null;
  taken: boolean;
}

type Phase = 'walk' | 'sitdown' | 'dwell' | 'standup' | 'gone';

interface Visitor extends VisitorState {
  phase: Phase;
  /** 现在所在（或刚离开）的路点 */
  at: number;
  /** 接下来要依次走过的路点 */
  route: number[];
  /** 要去的地方；null 表示正在走向出口 */
  spot: Spot | null;
  timer: number;
  visitsLeft: number;
  speed: number;
}

/** 线段 a→b 是否被碰撞盒挡住（留出 pad 的身位） */
function blockedBy(c: Collider, pad: number, ax: number, az: number, bx: number, bz: number) {
  let t0 = 0;
  let t1 = 1;
  const dx = bx - ax;
  const dz = bz - az;
  const tests = [
    [-dx, ax - (c.minX - pad)],
    [dx, c.maxX + pad - ax],
    [-dz, az - (c.minZ - pad)],
    [dz, c.maxZ + pad - az],
  ];
  for (const [p, q] of tests) {
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

/**
 * 本地模拟的访客：沿着一张手工定义的路点图慢慢走，在柜子前、照片墙前、码头、河边站一会儿，
 * 或者在沙发、长椅、树桩凳上坐一会儿，逛几处之后走回入口离开，过一阵再换一个人进来。
 * 他们只是在场：不放灯、不烧信、不送礼物，也不读写任何数据。
 */
export class SimulatedVisitors implements VisitorSource {
  private nodes: Node[] = [];
  private spots: Spot[] = [];
  private visitors: Visitor[] = [];
  private exit: number;
  private rnd = mulberry32(Math.floor(Math.random() * 1e9));
  private nextId = 1;

  constructor(private world: World) {
    this.exit = this.buildMap();
    for (let i = 0; i < V.count; i++) this.visitors.push(this.arriveInside());
  }

  private R(a: number, b: number) {
    return a + this.rnd() * (b - a);
  }

  // ---------- 路点图 ----------

  private node(x: number, z: number) {
    this.nodes.push({ x, z, links: [] });
    return this.nodes.length - 1;
  }

  private link(a: number, b: number) {
    this.nodes[a].links.push(b);
    this.nodes[b].links.push(a);
    if (import.meta.env.DEV && !this.clear(this.nodes[a], this.nodes[b])) {
      const f = (n: Node) => `(${n.x.toFixed(1)}, ${n.z.toFixed(1)})`;
      console.warn(`[visitors] 路线被挡住：${f(this.nodes[a])} → ${f(this.nodes[b])}`);
    }
  }

  private clear(a: { x: number; z: number }, b: { x: number; z: number }) {
    return !this.world.colliders.some((c) => blockedBy(c, 0.28, a.x, a.z, b.x, b.z));
  }

  /** 把一个新路点接到离它最近、中间没有东西挡着的枢纽上 */
  private attach(n: number, hubs: number[]) {
    const me = this.nodes[n];
    const byDist = [...hubs].sort((a, b) => this.dist(me, this.nodes[a]) - this.dist(me, this.nodes[b]));
    this.link(n, byDist.find((h) => this.clear(me, this.nodes[h])) ?? byDist[0]);
  }

  private dist(a: { x: number; z: number }, b: { x: number; z: number }) {
    return Math.hypot(a.x - b.x, a.z - b.z);
  }

  private stand(x: number, z: number, facing: number, hubs: number[], bowed = false) {
    const n = this.node(x, z);
    this.attach(n, hubs);
    this.spots.push({ node: n, facing, bowed, seat: null, taken: false });
  }

  private sit(seat: Seat, hubs: number[]) {
    const n = this.node(seat.approach.x, seat.approach.z);
    this.attach(n, hubs);
    this.spots.push({ node: n, facing: seat.facing, bowed: false, seat, taken: false });
    return n;
  }

  /** 搭好路点图和停留点，返回出口路点 */
  private buildMap() {
    const chain = (pts: Array<[number, number]>) => {
      const ids = pts.map(([x, z]) => this.node(x, z));
      for (let i = 1; i < ids.length; i++) this.link(ids[i - 1], ids[i]);
      return ids;
    };
    const P = (z: number): [number, number] => [pathX(z), z];
    const { north, south } = RIVER_BANKS;
    const FZ = CONFIG.bonfire.z;

    // 入口步道 → 大厅 → 通道 → 纪念区入口
    const path = chain([P(60), P(50), P(44), P(39), P(34), P(CONFIG.river.z), P(24.5), P(22), P(18.5), P(15), P(10), P(5), [0, 1.2]]);
    const [exit, , , , bridgeS, , , pastBridge, , byFire, , , door] = path;
    const inner = chain([[0, -2.5], [0, -9], [0, ZONES.hallBack + 1.5], [0, ZONES.hallBack - CONFIG.corridor.len / 2], [0, ZONES.memFront - 2]]);
    const [hallFront, hallMid, hallBack, , memDoor] = inner;
    this.link(door, hallFront);

    // 码头：从桥头绕过路灯和码头的灯杆走上去
    const dock = this.node(DOCK_X, south + 2.4);
    this.link(bridgeS, dock);
    this.stand(DOCK_X - 0.55, south - CONFIG.river.dock.len + 0.6, -0.4, [dock]);
    // 河边：过桥之后往两侧走几步，站在岸上看河（绕开桥头两边的树）
    for (const [hubX, spotX, facing] of [[-4, -6.7, Math.PI + 0.3], [4.9, 6.5, Math.PI - 0.2]]) {
      const hub = this.node(BRIDGE_X + hubX, north - 3.6);
      this.link(pastBridge, hub);
      this.stand(BRIDGE_X + spotX, north - 0.9, facing, [hub]);
    }

    // 篝火：从空地朝步道敞开的一侧进去，绕到树桩凳后面坐下
    const fireN = this.node(FIRE_X + 2.3, FZ + 1.6);
    const fireS = this.node(FIRE_X + 2.3, FZ - 1.7);
    this.link(byFire, fireN);
    this.link(byFire, fireS);
    // 树桩凳围在火堆背向步道的一侧，在它们外面再绕半圈
    const around = [[-1.2, 3.2], [-3.3, 0], [-1.2, -3.2]].map(([dx, dz]) => this.node(FIRE_X + dx, FZ + dz));
    const fireRing = [fireN, ...around, fireS];
    for (let i = 1; i < fireRing.length; i++) this.link(fireRing[i - 1], fireRing[i]);
    for (const seat of this.world.seats.filter((s) => s.zone === 'fire')) this.sit(seat, fireRing);

    // 大厅：照片墙、休息区的沙发、接待台
    const hw = CONFIG.hall.w / 2;
    const hallLeft = this.node(-6, -9);
    const lounge = this.node(5.6, -3.2);
    const loungeFar = this.node(9, -3.1);
    for (const h of [hallFront, hallMid, hallBack]) this.link(hallLeft, h);
    this.link(hallFront, lounge);
    this.link(lounge, loungeFar);
    for (const z of [-4.2, -8.6, -13]) this.stand(-hw + 1.9, z, Math.PI / 2, [hallLeft]);
    for (const seat of this.world.seats.filter((s) => s.zone === 'hall')) this.sit(seat, [lounge, loungeFar]);
    this.stand(hw - 4.6, -12.6, -Math.PI / 2, [hallMid, hallBack]);

    // 纪念区：两条纵向的通道串起每排柜子，中间绕着纪念树一圈
    const t = TREE_POS;
    const ring = [[1, 1], [-1, 1], [-1, -1], [1, -1]].map(([sx, sz]) => this.node(t.x + sx * 3.6, t.z + sz * 3.6));
    ring.forEach((n, i) => this.link(n, ring[(i + 1) % 4]));
    this.link(memDoor, ring[0]);
    this.link(memDoor, ring[1]);
    const rows = [...new Set([...this.world.slots.values()].map((s) => s.cabinetZ))].sort((a, b) => b - a);
    for (const side of [-1, 1]) {
      let prev = this.node(side * 6.5, ZONES.memFront - 3.5);
      this.link(memDoor, prev);
      for (const cz of rows) {
        const lane = this.node(side * 6.5, cz + 1.3);
        this.link(prev, lane);
        prev = lane;
        const cabX = [...this.world.slots.values()].find((s) => s.cabinetZ === cz && Math.sign(s.cabinetX) === side)?.cabinetX;
        if (cabX !== undefined) for (const dx of [-0.8, 0.8]) this.stand(cabX + dx, cz + 1.25, 0, [lane], true);
        // 通道和纪念树旁的一圈在树的前后各连一次
        const corner = ring.find((n) => Math.sign(this.nodes[n].x) === side && Math.abs(this.nodes[n].z - (cz + 1.3)) < 3.2);
        if (corner !== undefined) this.link(lane, corner);
      }
    }
    for (const seat of this.world.seats.filter((s) => s.zone === 'memorial')) this.sit(seat, ring);

    return exit;
  }

  /** 从 from 到 to 依次经过的路点（不含 from），按路程最短 */
  private routeTo(from: number, to: number) {
    const cost = new Array(this.nodes.length).fill(Infinity);
    const prev = new Array(this.nodes.length).fill(-1);
    const open = new Set([from]);
    cost[from] = 0;
    while (open.size) {
      let cur = -1;
      for (const n of open) if (cur < 0 || cost[n] < cost[cur]) cur = n;
      open.delete(cur);
      if (cur === to) break;
      for (const next of this.nodes[cur].links) {
        const c = cost[cur] + this.dist(this.nodes[cur], this.nodes[next]);
        if (c < cost[next]) {
          cost[next] = c;
          prev[next] = cur;
          open.add(next);
        }
      }
    }
    const route: number[] = [];
    for (let n = to; n !== from && n >= 0; n = prev[n]) route.unshift(n);
    return route;
  }

  // ---------- 访客 ----------

  private blank(): Visitor {
    return {
      id: this.nextId++,
      x: 0, y: 0, z: 0, facing: 0,
      color: V.colors[Math.floor(this.rnd() * V.colors.length)],
      posture: 'stand', bowed: false, alpha: 1,
      phase: 'dwell', at: this.exit, route: [], spot: null, timer: 0,
      visitsLeft: Math.round(this.R(V.visits[0], V.visits[1])),
      speed: V.speed * this.R(0.85, 1.15),
    };
  }

  private freeSpot(near?: { x: number; z: number }) {
    const free = this.spots.filter((s) => !s.taken);
    if (!free.length) return null;
    if (!near) return free[Math.floor(this.rnd() * free.length)];
    // 更愿意去近一点的地方，偶尔也会走远
    const weights = free.map((s) => 1 / (12 + this.dist(near, this.nodes[s.node])));
    let pick = this.rnd() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < free.length; i++) {
      pick -= weights[i];
      if (pick <= 0) return free[i];
    }
    return free[free.length - 1];
  }

  /** 开场时已经在馆里某处停留着的访客 */
  private arriveInside() {
    const v = this.blank();
    const spot = this.freeSpot();
    if (!spot) return v;
    spot.taken = true;
    v.spot = spot;
    v.at = spot.node;
    v.timer = this.R(3, V.dwell[1] * 0.7);
    this.settle(v, 1);
    return v;
  }

  /** 从入口外走进来的访客 */
  private arriveAtGate(v: Visitor) {
    Object.assign(v, this.blank());
    const n = this.nodes[this.exit];
    v.x = n.x;
    v.z = n.z;
    v.alpha = 0;
    this.headOut(v);
  }

  /** 选下一个要去的地方并出发；逛够了就走向出口 */
  private headOut(v: Visitor) {
    if (v.spot) v.spot.taken = false;
    const next = v.visitsLeft-- > 0 ? this.freeSpot(v) : null;
    v.spot = next;
    if (next) next.taken = true;
    v.route = this.routeTo(v.at, next ? next.node : this.exit);
    v.phase = 'walk';
    v.posture = 'walk';
    v.bowed = false;
  }

  /** 按坐下的进度 k（0 站在座位前，1 坐好）摆放位置 */
  private settle(v: Visitor, k: number) {
    const spot = v.spot!;
    const n = this.nodes[spot.node];
    const seat = spot.seat;
    const e = k * k * (3 - 2 * k);
    v.x = seat ? n.x + (seat.x - n.x) * e : n.x;
    v.z = seat ? n.z + (seat.z - n.z) * e : n.z;
    v.y = this.world.heightAt(v.x, v.z) + (seat ? (seat.top - SIT_HIP) * e : 0);
    v.facing = spot.facing;
    v.posture = seat && k > 0.25 ? 'sit' : 'stand';
    v.bowed = spot.bowed;
  }

  update(dt: number) {
    for (const v of this.visitors) this.step(v, dt);
    return this.visitors;
  }

  private step(v: Visitor, dt: number) {
    const leaving = v.phase === 'walk' && !v.spot;
    // 进场淡入；走到出口附近淡出
    const nearExit = leaving && v.route.length <= 1;
    v.alpha = Math.min(1, Math.max(0, v.alpha + ((nearExit ? -1 : 1) * dt) / V.fade));

    switch (v.phase) {
      case 'walk': {
        let left = v.speed * dt;
        while (left > 0 && v.route.length) {
          const n = this.nodes[v.route[0]];
          const dx = n.x - v.x;
          const dz = n.z - v.z;
          const d = Math.hypot(dx, dz);
          if (d > 0.001) v.facing = Math.atan2(-dx, -dz);
          if (d <= left) {
            v.x = n.x;
            v.z = n.z;
            v.at = v.route.shift()!;
            left -= d;
          } else {
            v.x += (dx / d) * left;
            v.z += (dz / d) * left;
            left = 0;
          }
        }
        v.y = this.world.heightAt(v.x, v.z);
        if (v.route.length) break;
        if (!v.spot) {
          v.phase = 'gone';
          v.timer = this.R(4, 20);
          v.posture = 'stand';
        } else {
          v.phase = v.spot.seat ? 'sitdown' : 'dwell';
          v.timer = v.spot.seat ? 0 : this.R(V.dwell[0], V.dwell[1]);
          this.settle(v, 0);
        }
        break;
      }
      case 'sitdown':
        v.timer += dt;
        this.settle(v, Math.min(1, v.timer / SIT_TIME));
        if (v.timer >= SIT_TIME) {
          v.phase = 'dwell';
          v.timer = this.R(V.dwell[0], V.dwell[1]);
        }
        break;
      case 'dwell':
        v.timer -= dt;
        if (v.timer > 0) break;
        if (v.spot?.seat) {
          v.phase = 'standup';
          v.timer = 0;
        } else this.headOut(v);
        break;
      case 'standup':
        v.timer += dt;
        this.settle(v, 1 - Math.min(1, v.timer / SIT_TIME));
        if (v.timer >= SIT_TIME) this.headOut(v);
        break;
      case 'gone':
        v.alpha = 0;
        v.timer -= dt;
        if (v.timer <= 0) this.arriveAtGate(v);
        break;
    }
  }
}
