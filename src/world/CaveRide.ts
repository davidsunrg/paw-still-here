import * as THREE from 'three';
import { CONFIG } from '../config';
import { mulberry32 } from '../data/pets';
import type { Lamp, World } from './World';

const V = CONFIG.cave;

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
  /** 快到终点了，该让画面暗下去、换到码头 */
  done: boolean;
}

/**
 * 思念之河的山洞和游船。山洞建在主场景之外很远的地方：一个很大很开阔的洞厅，河从中间流过，
 * 几盏彩色的大灯照着远处的洞壁，水面上漂着河灯，最后从洞口漂到夜空下。船沿河道的中线匀速走，人坐在船上只能转头看。
 */
export class CaveRide {
  readonly length: number;
  paused = false;
  /** 船在河道上走了多远 */
  private s = 0;
  private curve: THREE.CatmullRomCurve3;
  private boat = new THREE.Group();
  private lamp: Lamp;
  private facing = 0;
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
    this.buildBoat();
    // 船头的灯跟着船走
    this.lamp = world.pointLight(V.x, 1.2, V.z, 0, 9);
    this.boat.visible = false;
    world.updaters.push((_dt, t) => this.bob(t));
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

  // ---------- 游船 ----------

  /** 上船：船回到起点 */
  start() {
    this.s = 0;
    this.paused = false;
    this.boat.visible = true;
    this.lamp.intensity = 14;
    this.frame(0);
    this.facing = Math.atan2(-this.t.x, -this.t.z);
    this.place();
  }

  stop() {
    this.boat.visible = false;
    this.lamp.intensity = 0;
  }

  /** 船往前走一点，返回小人和镜头这一帧该在哪 */
  update(dt: number): RidePose {
    if (!this.paused) this.s = Math.min(this.length, this.s + V.speed * dt);
    this.frame(this.s);
    const facing = Math.atan2(-this.t.x, -this.t.z);
    const turn = Math.atan2(Math.sin(facing - this.facing), Math.cos(facing - this.facing));
    this.facing = facing;
    this.place();
    const { half } = profileAt(this.s);
    return {
      x: this.p.x,
      z: this.p.z,
      facing,
      turn,
      boom: half,
      ambience: V.ambience + (1 - V.ambience) * THREE.MathUtils.smoothstep(this.s, OPEN_AT - 8, OPEN_AT + 6),
      done: this.s >= this.length - V.fadeOut,
    };
  }

  /** 把船摆到当前的位置：小人坐在船中间靠后的那条横板上 */
  private place() {
    this.boat.position.set(this.p.x, 0, this.p.z);
    this.boat.rotation.y = this.facing;
    this.lamp.pos.set(this.p.x + this.t.x * 2.4, 1.1, this.p.z + this.t.z * 2.4);
  }

  private bob(t: number) {
    if (!this.boat.visible) return;
    this.boat.position.y = Math.sin(t * 1.1) * 0.012;
    this.boat.rotation.z = Math.sin(t * 0.8) * 0.01;
  }

  /** 木船：船头朝 -Z（和小人面朝的方向一致），原点在小人坐的那条横板上 */
  private buildBoat() {
    const C = CONFIG.colors;
    const mats = {
      wood: new THREE.MeshStandardMaterial({ color: C.wood, roughness: 0.85 }),
      dark: new THREE.MeshStandardMaterial({ color: C.woodDark, roughness: 0.9 }),
      light: new THREE.MeshStandardMaterial({ color: C.woodLight, roughness: 0.8 }),
    };
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const box = (x: number, y: number, z: number, sx: number, sy: number, sz: number, mat: THREE.Material, ry = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.scale.set(sx, sy, sz);
      m.rotation.y = ry;
      this.boat.add(m);
    };
    // 船身的中心比小人靠前一点
    const cz = -0.45;
    box(0, 0.07, cz, 1.06, 0.1, 3.0, mats.dark);
    for (const s of [-1, 1]) {
      box(s * 0.57, 0.28, cz, 0.08, 0.44, 3.0, mats.wood);
      box(s * 0.59, 0.5, cz, 0.1, 0.05, 3.04, mats.light);
      // 船头两侧向中间收拢的板
      box(s * 0.31, 0.3, cz - 1.82, 0.08, 0.48, 0.82, mats.wood, s * 0.68);
    }
    box(0, 0.28, cz + 1.52, 1.2, 0.44, 0.08, mats.wood);
    box(0, 0.44, cz - 2.14, 0.1, 0.78, 0.1, mats.dark);
    // 横板：小人坐的一条，前面还有一条
    box(0, 0.39, 0.02, 1.08, 0.06, 0.34, mats.light);
    box(0, 0.39, -1.25, 1.08, 0.06, 0.3, mats.light);
    // 船头挑着的一盏灯
    box(0, 1.0, cz - 2.14, 0.03, 0.4, 0.03, mats.dark);
    const glow = new THREE.Mesh(
      new THREE.BoxGeometry(0.17, 0.22, 0.17),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(C.warm).multiplyScalar(1.5) }),
    );
    glow.position.set(0, 1.08, cz - 2.14);
    this.boat.add(glow);
    this.world.scene.add(this.boat);
  }

  // ---------- 山洞 ----------

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
