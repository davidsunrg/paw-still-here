import * as THREE from 'three';
import { CONFIG } from '../config';

/** 地面上的一串光点，指引访客走到某个格子前，或者走到河边的码头 */
export class Guide {
  private mesh: THREE.InstancedMesh;
  private dots: THREE.Vector3[] = [];
  private target: THREE.Vector3 | null = null;
  private onArrive: (() => void) | null = null;
  private m = new THREE.Matrix4();
  private static readonly MAX = 260;

  /** 地面高度，让光点在桥上时贴着桥面 */
  heightAt: (x: number, z: number) => number = () => 0;

  constructor(scene: THREE.Scene) {
    this.mesh = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.07, 8, 6),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(CONFIG.colors.warm).multiplyScalar(2.6) }),
      Guide.MAX,
    );
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  get active() {
    return this.target !== null;
  }

  show(points: THREE.Vector3[], onArrive: () => void) {
    this.dots = [];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      const n = Math.max(1, Math.round(a.distanceTo(b) / 0.55));
      for (let k = 0; k < n && this.dots.length < Guide.MAX; k++) {
        const d = a.clone().lerp(b, k / n);
        d.y = this.heightAt(d.x, d.z);
        this.dots.push(d);
      }
    }
    this.target = points[points.length - 1] ?? null;
    this.onArrive = onArrive;
    this.mesh.count = this.dots.length;
  }

  clear() {
    this.target = null;
    this.onArrive = null;
    this.mesh.count = 0;
  }

  update(t: number, player: THREE.Vector3) {
    if (!this.target) return;
    if (Math.hypot(player.x - this.target.x, player.z - this.target.z) < 1.6) {
      const cb = this.onArrive;
      this.clear();
      cb?.();
      return;
    }
    // 光点像水波一样朝目的地流动
    this.dots.forEach((d, i) => {
      const s = 0.55 + 0.75 * Math.max(0, Math.sin(i * 0.5 - t * 4));
      this.m.makeScale(s, s, s).setPosition(d.x, d.y + 0.14, d.z);
      this.mesh.setMatrixAt(i, this.m);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
