import * as THREE from 'three';
import { CONFIG } from '../config';

/** 点击地面后，标出小人要走去的地方的一圈淡光；走到或取消后淡出 */
export class Marker {
  private mesh: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private on = false;
  private level = 0;

  constructor(scene: THREE.Scene) {
    this.mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.2, 0.27, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(CONFIG.colors.warm).multiplyScalar(1.6),
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  show(x: number, y: number, z: number) {
    this.mesh.position.set(x, y + 0.07, z);
    this.on = true;
    this.level = 0;
  }

  hide() {
    this.on = false;
  }

  update(dt: number, t: number) {
    this.level += ((this.on ? 1 : 0) - this.level) * (1 - Math.exp(-dt * 8));
    this.mesh.visible = this.level > 0.01;
    this.mesh.material.opacity = this.level * (0.6 + 0.25 * Math.sin(t * 5));
    // 刚点下时从大到小收拢一下
    this.mesh.scale.setScalar(this.on ? 1 + (1 - this.level) * 0.9 : 1);
  }
}
