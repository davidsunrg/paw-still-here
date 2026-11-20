import * as THREE from 'three';
import { AvatarBatch, defaultPose, type AvatarPose } from '../world/Avatar';

/**
 * 其他访客 —— 数据从哪来和怎么画是分开的。
 *
 * VisitorSource 每帧给出一组访客此刻的状态；Crowd 只管把这些状态画出来（插值、走路动画、坐下）。
 * 现在唯一的来源是 SimulatedVisitors（本地模拟）。以后接后端时，再写一个从网络收状态的 VisitorSource
 * （比如每秒收 10 次位置），换掉 main.ts 里创建来源的那一行即可，Crowd 和小人模型都不用动：
 * 网络来的状态更新得不那么频繁也没关系，Crowd 本来就会在两次状态之间做平滑。
 */
export interface VisitorState {
  /** 在这位访客在场期间保持不变 */
  id: number;
  x: number;
  /** 脚底（坐着时是让臀部落在坐面上的基准高度） */
  y: number;
  z: number;
  facing: number;
  color: number;
  posture: 'walk' | 'stand' | 'sit';
  /** 是否低着头（站在格子前） */
  bowed: boolean;
  /** 0–1，进场 / 离场时的淡入淡出 */
  alpha: number;
}

export interface VisitorSource {
  /** 推进到当前时刻，返回此刻在场的访客 */
  update(dt: number): readonly VisitorState[];
}

const TAU = Math.PI * 2;
function angleLerp(a: number, b: number, k: number) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return a + d * k;
}

/** 把访客状态画成小人：位置和朝向做平滑，步伐由实际走过的距离驱动 */
export class Crowd {
  /** 最多显示多少人（低画质时减少） */
  limit: number;
  /** 「独自参观」时整个隐藏 */
  hidden = false;
  /** 访客在看某一只宠物的纪念角时，其他人慢慢淡出，不挡在镜头和纪念角之间 */
  away = false;
  private show = 1;

  /** 立刻藏起来 / 显示出来，不淡入淡出（画面暗着换场景的时候用） */
  snap() {
    this.show = this.away ? 0 : 1;
  }

  private batch: AvatarBatch;
  private poses: AvatarPose[];
  private ids: number[];

  constructor(
    scene: THREE.Scene,
    private source: VisitorSource,
    private max: number,
  ) {
    this.limit = max;
    this.batch = new AvatarBatch(scene, max);
    this.poses = Array.from({ length: max }, () => defaultPose(0xffffff));
    this.ids = new Array(max).fill(-1);
  }

  update(dt: number, t: number) {
    // 即使隐藏也让来源继续走，重新显示时大家已经在别处了
    const states = this.source.update(dt);
    this.batch.visible = !this.hidden;
    if (this.hidden) return;

    const k = 1 - Math.exp(-dt * 10);
    this.show += ((this.away ? 0 : 1) - this.show) * (1 - Math.exp(-dt * 5));
    for (let i = 0; i < this.max; i++) {
      const s = i < this.limit ? states[i] : undefined;
      const p = this.poses[i];
      if (!s || s.alpha <= 0.01) {
        this.ids[i] = -1;
        p.scale = 0;
        this.batch.set(i, p, t);
        continue;
      }
      if (this.ids[i] !== s.id) {
        // 新来的访客直接出现在它的位置上，不从上一位的位置滑过来
        this.ids[i] = s.id;
        Object.assign(p, defaultPose(s.color), { x: s.x, y: s.y, z: s.z, facing: s.facing, sit: s.posture === 'sit' ? 1 : 0 });
      }
      const dx = (s.x - p.x) * k;
      const dz = (s.z - p.z) * k;
      p.x += dx;
      p.z += dz;
      p.y += (s.y - p.y) * k;
      p.facing = angleLerp(p.facing, s.facing, 1 - Math.exp(-dt * 6));
      const moved = Math.hypot(dx, dz);
      const speed = dt > 0 ? moved / dt : 0;
      // 访客走得慢，步子也小一些
      p.phase += moved * 4.4;
      p.stride += (Math.min(1, speed / 1.6) * 0.8 - p.stride) * k;
      p.sit += ((s.posture === 'sit' ? 1 : 0) - p.sit) * (1 - Math.exp(-dt * 3.5));
      p.bow += ((s.bowed ? 0.3 : 0) - p.bow) * (1 - Math.exp(-dt * 3));
      p.alpha = s.alpha * this.show;
      p.scale = 1;
      p.color = s.color;
      this.batch.set(i, p, t);
    }
    this.batch.commit();
  }
}
