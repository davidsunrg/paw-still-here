import * as THREE from 'three';
import { CONFIG } from '../config';

/** 一个小人此刻的样子。朝向的约定和镜头一致：0 表示面向 -Z */
export interface AvatarPose {
  x: number;
  /** 脚底的高度 */
  y: number;
  z: number;
  facing: number;
  /** 步伐相位（弧度），走得越远越大 */
  phase: number;
  /** 摆臂摆腿的幅度：0 站立，1 行走，更大是跑动 */
  stride: number;
  /** 0 站着，1 坐着 */
  sit: number;
  /** 低头的角度（弧度） */
  bow: number;
  /** 衣服颜色 */
  color: THREE.ColorRepresentation;
  /** 整体缩放，0 表示不显示 */
  scale: number;
  /** 0–1 的不透明度，进场 / 离场时用来淡入淡出 */
  alpha: number;
}

export function defaultPose(color: THREE.ColorRepresentation): AvatarPose {
  return { x: 0, y: 0, z: 0, facing: 0, phase: 0, stride: 0, sit: 0, bow: 0, color, scale: 1, alpha: 1 };
}

// 身体各部分的尺寸，按 1.6 m 的身高搭好，再整体缩放到 CONFIG.player.height
const HIP = 0.7;
const SHOULDER = 1.2;
const HEAD = 1.42;
/** 小人受光的压缩程度，越大越不容易被灯照得发白 */
const LIGHT_SOFTEN = 1.3;
const SKIN = new THREE.Color(0xd9b494);
const TROUSERS = new THREE.Color(0x2e3145);

const m = new THREE.Matrix4();
const root = new THREE.Matrix4();
const torso = new THREE.Matrix4();
const q = new THREE.Quaternion();
const e = new THREE.Euler();
const v = new THREE.Vector3();
const s = new THREE.Vector3();
const c = new THREE.Color();

function local(out: THREE.Matrix4, x: number, y: number, z: number, rx: number, rz = 0, sy = 1) {
  return out.compose(v.set(x, y, z), q.setFromEuler(e.set(rx, 0, rz)), s.set(1, sy, 1));
}

/**
 * 一批低多边形小人。每个身体部位是一个 InstancedMesh，所以不管有多少人都只多 4 次绘制。
 * 访客自己的小人和其他访客用的是同一套模型和同一套姿态计算。
 */
export class AvatarBatch {
  private torso: THREE.InstancedMesh;
  private head: THREE.InstancedMesh;
  private arms: THREE.InstancedMesh;
  private legs: THREE.InstancedMesh;
  private meshes: THREE.InstancedMesh[];
  private mat: THREE.MeshStandardMaterial;

  constructor(
    scene: THREE.Scene,
    readonly count: number,
  ) {
    this.mat = new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true });
    // 路灯、码头灯离小人的头很近，照在浅色衣服上会过曝发白。
    // 这里把小人受到的光照做一次柔和的压缩：暗处几乎不变，越亮压得越多，最亮也不会超过 1 / LIGHT_SOFTEN。
    // 每个小人自己的不透明度用「抖动丢弃像素」实现：材质仍然是不透明的，不用排序，也不影响其他小人。
    this.mat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('void main() {', 'attribute float aAlpha;\nvarying float vAlpha;\nvoid main() {\n  vAlpha = aAlpha;');
      shader.fragmentShader = shader.fragmentShader
        .replace(
          'void main() {',
          `varying float vAlpha;
          void main() {
            if (vAlpha < 0.995) {
              float n = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
              if (n > vAlpha) discard;
            }`,
        )
        .replace(
          '#include <opaque_fragment>',
          `outgoingLight = outgoingLight / (1.0 + outgoingLight * ${LIGHT_SOFTEN.toFixed(2)});\n#include <opaque_fragment>`,
        );
    };
    const make = (geo: THREE.BufferGeometry, n: number) => {
      const mesh = new THREE.InstancedMesh(geo, this.mat, n);
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      for (let i = 0; i < n; i++) mesh.setColorAt(i, c.set(0xffffff));
      geo.setAttribute('aAlpha', new THREE.InstancedBufferAttribute(new Float32Array(n).fill(1), 1));
      scene.add(mesh);
      return mesh;
    };
    // 各部位的原点都放在关节上：躯干在胯部，头在脖子，手臂在肩，腿在胯
    this.torso = make(new THREE.CylinderGeometry(0.15, 0.23, 0.56, 7).translate(0, 0.28, 0), count);
    this.head = make(new THREE.IcosahedronGeometry(0.175, 1).translate(0, 0.02, 0), count);
    this.arms = make(new THREE.CylinderGeometry(0.055, 0.045, 0.52, 5).translate(0, -0.26, 0), count * 2);
    this.legs = make(new THREE.CylinderGeometry(0.075, 0.06, HIP, 5).translate(0, -HIP / 2, 0), count * 2);
    this.meshes = [this.torso, this.head, this.arms, this.legs];
  }

  /** 整批小人的不透明度（镜头贴得太近时用来淡出自己的小人） */
  set opacity(o: number) {
    const hide = o < 0.02;
    for (const mesh of this.meshes) mesh.visible = !hide;
    this.mat.transparent = o < 0.999;
    this.mat.opacity = o;
    this.mat.depthWrite = o > 0.5;
  }

  set visible(on: boolean) {
    for (const mesh of this.meshes) mesh.visible = on;
  }

  /** 按姿态摆好第 i 个小人；t 是全局时间，用来做站立时的呼吸起伏 */
  set(i: number, p: AvatarPose, t: number) {
    const k = (CONFIG.player.height / 1.6) * p.scale;
    const swing = Math.sin(p.phase) * Math.min(1.5, p.stride) * (1 - p.sit);
    const bob = Math.abs(Math.sin(p.phase)) * 0.035 * Math.min(1.5, p.stride) * (1 - p.sit);
    const breathe = 1 + Math.sin(t * 1.7 + i * 1.3) * 0.012 * (1 - Math.min(1, p.stride));
    const lean = -0.1 * Math.max(0, p.stride - 1);
    // 坐下时胯部降到凳面的高度
    const drop = p.sit * (HIP - 0.44);

    root.compose(v.set(p.x, p.y + (bob - drop) * k, p.z), q.setFromEuler(e.set(0, p.facing, 0)), s.set(k, k, k));

    torso.multiplyMatrices(root, local(m, 0, HIP, 0, lean - p.bow * 0.25, 0, breathe));
    this.torso.setMatrixAt(i, torso);
    this.head.setMatrixAt(i, m.multiplyMatrices(root, local(m, 0, HEAD + (breathe - 1) * 0.5, -p.bow * 0.06, -p.bow)));

    for (const side of [-1, 1]) {
      const j = i * 2 + (side + 1) / 2;
      // 手臂和对侧的腿一起向前；坐下时手搭在腿上
      const arm = -side * swing * 0.75 + p.sit * 0.55;
      this.arms.setMatrixAt(j, m.multiplyMatrices(root, local(m, side * 0.215, SHOULDER, 0, arm, side * 0.1)));
      const leg = side * swing * 0.7 + p.sit * 1.45;
      this.legs.setMatrixAt(j, m.multiplyMatrices(root, local(m, side * 0.095, HIP, 0, leg)));
      this.arms.setColorAt(j, c.set(p.color));
      this.legs.setColorAt(j, TROUSERS);
      this.arms.geometry.attributes.aAlpha.setX(j, p.alpha);
      this.legs.geometry.attributes.aAlpha.setX(j, p.alpha);
    }
    this.torso.geometry.attributes.aAlpha.setX(i, p.alpha);
    this.head.geometry.attributes.aAlpha.setX(i, p.alpha);
    this.torso.setColorAt(i, c.set(p.color));
    this.head.setColorAt(i, SKIN);
  }

  /** 这一帧的姿态都设好之后调用一次 */
  commit() {
    for (const mesh of this.meshes) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.geometry.attributes.aAlpha.needsUpdate = true;
    }
  }
}
