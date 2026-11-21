import * as THREE from 'three';
import { glowTexture } from './textures';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

/** 收集同一种几何体的大量实例，最后合成一个 InstancedMesh（一次绘制调用）。 */
export class Instancer {
  private mats: number[] = [];
  private cols: number[] = [];
  mesh?: THREE.InstancedMesh;

  constructor(
    private geo: THREE.BufferGeometry,
    private mat: THREE.Material,
    private shadow = true,
  ) {}

  add(
    x: number, y: number, z: number,
    sx: number, sy: number, sz: number,
    color: THREE.ColorRepresentation,
    intensity = 1,
    ry = 0, rx = 0, rz = 0,
  ) {
    _e.set(rx, ry, rz, 'YXZ');
    _q.setFromEuler(_e);
    _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
    for (let i = 0; i < 16; i++) this.mats.push(_m.elements[i]);
    _c.set(color).multiplyScalar(intensity);
    this.cols.push(_c.r, _c.g, _c.b);
  }

  build(parent: THREE.Object3D) {
    const n = this.mats.length / 16;
    if (!n) return;
    const mesh = new THREE.InstancedMesh(this.geo, this.mat, n);
    mesh.instanceMatrix.array.set(this.mats);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.cols), 3);
    mesh.castShadow = this.shadow;
    mesh.receiveShadow = this.shadow;
    mesh.frustumCulled = false;
    parent.add(mesh);
    this.mesh = mesh;
    this.mats = [];
    this.cols = [];
  }
}

/**
 * 积木工具箱：场景里几乎所有东西都由 方块 / 圆柱 / 圆锥 / 球 拼出来。
 * 圆柱和圆锥以底面为基准（y 是底部高度），方块和球以中心为基准。
 */
export class Kit {
  readonly matte = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0 });
  readonly flat = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, flatShading: true });
  readonly glowMat = new THREE.MeshBasicMaterial();
  readonly flameMat = new THREE.MeshBasicMaterial();
  readonly poolMat = new THREE.MeshBasicMaterial({
    map: glowTexture(),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  private boxGeo = new THREE.BoxGeometry(1, 1, 1);
  private cylGeo = new THREE.CylinderGeometry(1, 1, 1, 14).translate(0, 0.5, 0);
  private coneGeo = new THREE.ConeGeometry(1, 1, 7).translate(0, 0.5, 0);
  private ballGeo = new THREE.IcosahedronGeometry(1, 1);
  private smoothBallGeo = new THREE.SphereGeometry(1, 10, 8);

  private boxes = new Instancer(this.boxGeo, this.matte);
  private cyls = new Instancer(this.cylGeo, this.matte);
  private cones = new Instancer(this.coneGeo, this.flat);
  private balls = new Instancer(this.ballGeo, this.flat);
  private glowBoxes = new Instancer(this.boxGeo, this.glowMat, false);
  private glowBalls = new Instancer(this.smoothBallGeo, this.glowMat, false);
  private glowCyls = new Instancer(this.cylGeo, this.glowMat, false);
  private flames = new Instancer(this.smoothBallGeo, this.flameMat, false);
  private pools = new Instancer(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), this.poolMat, false);

  box(x: number, y: number, z: number, sx: number, sy: number, sz: number, color: number, ry = 0) {
    this.boxes.add(x, y, z, sx, sy, sz, color, 1, ry);
  }
  cyl(x: number, yBase: number, z: number, r: number, h: number, color: number) {
    this.cyls.add(x, yBase, z, r, h, r, color);
  }
  cone(x: number, yBase: number, z: number, r: number, h: number, color: number, ry = 0) {
    this.cones.add(x, yBase, z, r, h, r, color, 1, ry);
  }
  ball(x: number, y: number, z: number, r: number, color: number, sy = 1, ry = 0) {
    this.balls.add(x, y, z, r, r * sy, r, color, 1, ry);
  }
  glowBox(x: number, y: number, z: number, sx: number, sy: number, sz: number, color: number, intensity = 2, ry = 0) {
    this.glowBoxes.add(x, y, z, sx, sy, sz, color, intensity, ry);
  }
  glowBall(x: number, y: number, z: number, r: number, color: number, intensity = 2) {
    this.glowBalls.add(x, y, z, r, r, r, color, intensity);
  }
  glowCyl(x: number, yBase: number, z: number, r: number, h: number, color: number, intensity = 2) {
    this.glowCyls.add(x, yBase, z, r, h, r, color, intensity);
  }
  /** 烛火：会统一轻微闪烁 */
  flame(x: number, y: number, z: number, r: number) {
    this.flames.add(x, y, z, r * 0.75, r * 1.5, r * 0.75, 0xffb45a, 3.2);
  }
  /** 地面上的暖色光晕 */
  pool(x: number, z: number, size: number, color: number, intensity = 0.35, y = 0.075) {
    this.pools.add(x, y, z, size, 1, size, color, intensity);
  }

  build(parent: THREE.Object3D) {
    for (const i of [
      this.boxes, this.cyls, this.cones, this.balls,
      this.glowBoxes, this.glowBalls, this.glowCyls, this.flames, this.pools,
    ]) {
      i.build(parent);
    }
  }

  update(t: number) {
    const f = 0.88 + 0.12 * Math.sin(t * 9.1) * Math.sin(t * 5.3 + 1.2);
    this.flameMat.color.setScalar(f);
  }
}
