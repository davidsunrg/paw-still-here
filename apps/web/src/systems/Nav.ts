import type { Collider } from '../world/World';

export interface NavPoint {
  x: number;
  z: number;
}

export interface NavBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/**
 * 点击走路的二维栅格寻路。
 * 只按 AABB 碰撞体标记不可走的格子；高度差（桥、石阶、码头）不参与判断，
 * 由 Player.heightAt 负责把小人放到正确的高度。
 */
export class NavGrid {
  private readonly cell: number;
  private readonly cols: number;
  private readonly rows: number;
  private readonly minX: number;
  private readonly minZ: number;
  private readonly maxX: number;
  private readonly maxZ: number;
  private readonly blocked: Uint8Array;

  constructor(colliders: Collider[], bounds: NavBounds, radius: number, cell = 0.5) {
    this.cell = cell;
    this.minX = bounds.minX;
    this.maxX = bounds.maxX;
    this.minZ = bounds.minZ;
    this.maxZ = bounds.maxZ;
    this.cols = Math.max(1, Math.ceil((bounds.maxX - bounds.minX) / cell));
    this.rows = Math.max(1, Math.ceil((bounds.maxZ - bounds.minZ) / cell));
    this.blocked = new Uint8Array(this.cols * this.rows);

    // 只标碰撞体覆盖到的格子，比逐格检查快得多
    for (const c of colliders) {
      const x0 = Math.max(0, Math.floor((c.minX - radius - this.minX) / cell));
      const x1 = Math.min(this.cols - 1, Math.floor((c.maxX + radius - this.minX) / cell));
      const z0 = Math.max(0, Math.floor((c.minZ - radius - this.minZ) / cell));
      const z1 = Math.min(this.rows - 1, Math.floor((c.maxZ + radius - this.minZ) / cell));
      if (x1 < x0 || z1 < z0) continue;
      for (let z = z0; z <= z1; z++) {
        const row = z * this.cols;
        for (let x = x0; x <= x1; x++) this.blocked[row + x] = 1;
      }
    }
  }

  findPath(from: NavPoint, to: NavPoint): NavPoint[] | null {
    const start = this.nearestFree(this.cellX(from.x), this.cellZ(from.z));
    const end = this.nearestFree(this.cellX(to.x), this.cellZ(to.z));
    if (start < 0 || end < 0) return null;
    if (start === end) return this.shortPath(from, to, start);
    const total = this.cols * this.rows;
    const gScore = new Float32Array(total).fill(Infinity);
    const fScore = new Float32Array(total).fill(Infinity);
    const came = new Int32Array(total).fill(-1);
    const closed = new Uint8Array(total);
    const heap: number[] = [];
    const push = (i: number) => {
      heap.push(i);
      let k = heap.length - 1;
      while (k > 0) {
        const p = (k - 1) >> 1;
        if (fScore[heap[p]!]! <= fScore[heap[k]!]!) break;
        [heap[p], heap[k]] = [heap[k]!, heap[p]!];
        k = p;
      }
    };
    const pop = () => {
      const top = heap[0]!;
      const last = heap.pop()!;
      if (heap.length) {
        heap[0] = last;
        let k = 0;
        for (;;) {
          const l = k * 2 + 1;
          const r = l + 1;
          let m = k;
          if (l < heap.length && fScore[heap[l]!]! < fScore[heap[m]!]!) m = l;
          if (r < heap.length && fScore[heap[r]!]! < fScore[heap[m]!]!) m = r;
          if (m === k) break;
          [heap[m], heap[k]] = [heap[k]!, heap[m]!];
          k = m;
        }
      }
      return top;
    };
    const heur = (i: number) => {
      const dx = Math.abs((i % this.cols) - (end % this.cols));
      const dz = Math.abs(Math.floor(i / this.cols) - Math.floor(end / this.cols));
      return Math.max(dx, dz) + 0.414 * Math.min(dx, dz);
    };
    gScore[start] = 0;
    fScore[start] = heur(start);
    push(start);
    const dirs = [
      [1, 0], [-1, 0], [0, 1], [0, -1],
      [1, 1], [1, -1], [-1, 1], [-1, -1],
    ] as const;
    while (heap.length) {
      const cur = pop();
      if (closed[cur]) continue;
      closed[cur] = 1;
      if (cur === end) break;
      const cx = cur % this.cols;
      const cz = Math.floor(cur / this.cols);
      for (const [dx, dz] of dirs) {
        const nx = cx + dx;
        const nz = cz + dz;
        if (nx < 0 || nx >= this.cols || nz < 0 || nz >= this.rows) continue;
        const ni = nz * this.cols + nx;
        if (this.blocked[ni] || closed[ni]) continue;
        // 斜着走不能穿过两个障碍的夹角
        if (dx && dz && (this.blocked[cz * this.cols + nx] || this.blocked[nz * this.cols + cx])) continue;
        const step = dx && dz ? 1.414 : 1;
        const next = gScore[cur]! + step;
        if (next >= gScore[ni]!) continue;
        gScore[ni] = next;
        fScore[ni] = next + heur(ni);
        came[ni] = cur;
        push(ni);
      }
    }
    if (came[end] < 0) return null;
    const cells: number[] = [];
    for (let at = end; at >= 0; at = came[at]!) {
      cells.push(at);
      if (at === start) break;
    }
    cells.reverse();
    const pts: NavPoint[] = [{ x: from.x, z: from.z }];
    for (const i of cells) pts.push(this.center(i));
    const last = pts[pts.length - 1]!;
    if (this.freeAt(to.x, to.z) && this.lineClear(last, to)) pts.push({ x: to.x, z: to.z });
    return this.smooth(pts);
  }

  private shortPath(from: NavPoint, to: NavPoint, cell: number): NavPoint[] {
    const pts: NavPoint[] = [{ x: from.x, z: from.z }, this.center(cell)];
    if (this.freeAt(to.x, to.z) && this.lineClear(pts[1]!, to)) pts.push({ x: to.x, z: to.z });
    return this.smooth(pts);
  }

  /** 用视线检查把栅格点串成尽量少的折线 */
  private smooth(pts: NavPoint[]): NavPoint[] {
    if (pts.length <= 1) return pts;
    const out: NavPoint[] = [pts[0]!];
    let i = 0;
    while (i < pts.length - 1) {
      let j = pts.length - 1;
      while (j > i + 1 && !this.lineClear(pts[i]!, pts[j]!)) j--;
      out.push(pts[j]!);
      i = j;
    }
    return out;
  }

  private lineClear(a: NavPoint, b: NavPoint): boolean {
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.ceil(d / (this.cell * 0.45));
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const x = a.x + (b.x - a.x) * t;
      const z = a.z + (b.z - a.z) * t;
      if (!this.freeAt(x, z)) return false;
    }
    return true;
  }

  private cellX(x: number) {
    return Math.min(this.cols - 1, Math.max(0, Math.floor((x - this.minX) / this.cell)));
  }

  private cellZ(z: number) {
    return Math.min(this.rows - 1, Math.max(0, Math.floor((z - this.minZ) / this.cell)));
  }

  private center(index: number): NavPoint {
    return {
      x: this.minX + ((index % this.cols) + 0.5) * this.cell,
      z: this.minZ + (Math.floor(index / this.cols) + 0.5) * this.cell,
    };
  }

  private freeAt(x: number, z: number): boolean {
    if (x < this.minX || x > this.maxX || z < this.minZ || z > this.maxZ) return false;
    return !this.blocked[this.cellZ(z) * this.cols + this.cellX(x)];
  }

  private nearestFree(cx: number, cz: number): number {
    if (!this.blocked[cz * this.cols + cx]) return cz * this.cols + cx;
    const maxRing = Math.min(40, Math.max(this.cols, this.rows));
    for (let r = 1; r <= maxRing; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
          const x = cx + dx;
          const z = cz + dz;
          if (x < 0 || x >= this.cols || z < 0 || z >= this.rows) continue;
          if (!this.blocked[z * this.cols + x]) return z * this.cols + x;
        }
      }
    }
    return -1;
  }
}
