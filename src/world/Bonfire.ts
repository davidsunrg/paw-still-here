import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG } from '../config';
import { mulberry32 } from '../data/pets';
import { STR } from '../strings';
import { FIRE_X, pathX } from './Outdoor';
import type { World } from './World';

const BF = CONFIG.bonfire;
const FX = FIRE_X;
const FZ = BF.z;

/** 站在篝火旁写信的位置和朝向：在靠步道的一侧，面向火堆、略微低头 */
/** 小人站在火堆旁、面向火；镜头从它的斜后方看过去，火不会被小人挡住 */
export const FIRE_SPOT = { x: FX + 1.6, z: FZ, facing: Math.PI / 2, yaw: Math.PI / 2 - 0.6, pitch: -0.32 };

/** 信纸从手里飞进火堆的时长（秒），之后才开始燃烧 */
const FLY_TIME = 1.1;
/** 每一粒火星从升起到熄灭的时长，以及一封信的火星在多长时间内陆续升起 */
const SPARK_LIFE = 6;
const SPARK_SPREAD = 3.2;

export interface Bonfire {
  /** 把一封信从 from 处投进火里烧掉 */
  burn(from: THREE.Vector3): void;
}

/** 搭建篝火空地：泥地、石头圈、柴堆、火焰、火星、树桩凳，以及烧信的动画 */
export function buildBonfire(w: World): Bonfire {
  const { kit, scene } = w;
  const C = CONFIG.colors;
  const rnd = mulberry32(53);
  const R = (a: number, b: number) => a + rnd() * (b - a);

  // ---------- 空地 ----------
  const dirt = new THREE.Mesh(
    new THREE.CircleGeometry(BF.radius, 28).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x6b5a45, roughness: 1 }),
  );
  dirt.position.set(FX, 0.015, FZ);
  dirt.receiveShadow = true;
  scene.add(dirt);
  // 空地边缘压着一圈小石子，让泥地和草地的交界自然一些
  for (let a = 0; a < Math.PI * 2; a += R(0.22, 0.5)) {
    const r = BF.radius + R(-0.12, 0.1);
    kit.ball(FX + Math.cos(a) * r, 0.02, FZ + Math.sin(a) * r, R(0.07, 0.15), 0x7d7870, 0.6, R(0, 6));
  }
  // 从步道通到空地的几块踏脚石
  const edge = pathX(FZ) - CONFIG.path.width / 2;
  for (let i = 0; i < 3; i++) {
    const x = THREE.MathUtils.lerp(edge - 0.1, FX + BF.radius + 0.15, (i + 0.5) / 3);
    const g = Math.round(R(118, 150));
    kit.cyl(x, 0.01, FZ + R(-0.18, 0.18), R(0.26, 0.34), 0.05, (g << 16) | (g << 8) | (g - 8));
  }

  // ---------- 石头圈和柴堆 ----------
  const ring = 0.78;
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2 + R(-0.08, 0.08);
    const g = Math.round(R(62, 84));
    kit.ball(FX + Math.cos(a) * ring, 0.1, FZ + Math.sin(a) * ring, R(0.17, 0.23), (g << 16) | (g << 8) | (g - 6), 0.75, R(0, 6));
  }
  kit.cyl(FX, 0.02, FZ, ring - 0.08, 0.03, 0x1f1a17);
  // 几根木柴斜靠在一起，合并成一个网格
  const logs: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const g = new THREE.CylinderGeometry(0.055, 0.07, 0.95, 6);
    g.rotateZ(0.95).rotateY(a).translate(Math.cos(a) * -0.2, 0.3, Math.sin(a) * 0.2);
    logs.push(g);
  }
  const logMesh = new THREE.Mesh(
    mergeGeometries(logs),
    new THREE.MeshStandardMaterial({ color: 0x3a2a20, roughness: 1, flatShading: true }),
  );
  logMesh.position.set(FX, 0, FZ);
  logMesh.castShadow = true;
  scene.add(logMesh);
  kit.glowBall(FX, 0.14, FZ, 0.2, 0xff6a2a, 2.2);
  kit.pool(FX, FZ, 9, 0xff8a3c, 0.42);
  w.collide(FX, FZ, 1.5, 1.5);

  // ---------- 树桩凳：背对步道的一面围着摆，朝步道的一面敞开 ----------
  for (const deg of [105, 150, 195, 240]) {
    const a = THREE.MathUtils.degToRad(deg + R(-6, 6));
    const x = FX + Math.cos(a) * 1.85;
    const z = FZ + Math.sin(a) * 1.85;
    const r = R(0.26, 0.31);
    kit.cyl(x, 0, z, r, 0.4, 0x5b4332);
    kit.cyl(x, 0.4, z, r - 0.025, 0.025, C.woodLight);
    w.collide(x, z, r * 1.7, r * 1.7);
    // 面向火堆坐；访客从凳子后面（空地外侧）走过来
    w.seat('fire', x, z, 0.425, -Math.cos(a), -Math.sin(a), -0.8);
  }

  // ---------- 火焰：几个会跳动的圆锥 ----------
  const flames: Array<[number, number, number, number, [number, number, number]]> = [
    [0, 0, 0.36, 1.05, [1.0, 0.2, 0.03]],
    [0.16, 0.06, 0.24, 0.78, [1.2, 0.32, 0.05]],
    [-0.14, 0.1, 0.23, 0.72, [1.2, 0.32, 0.05]],
    [0.03, -0.16, 0.21, 0.66, [1.2, 0.32, 0.05]],
    [0, 0, 0.22, 0.8, [1.5, 0.6, 0.1]],
    [0.02, 0.01, 0.12, 0.5, [1.9, 1.15, 0.32]],
  ];
  const flameMesh = new THREE.InstancedMesh(
    new THREE.ConeGeometry(1, 1, 6).translate(0, 0.5, 0),
    new THREE.MeshBasicMaterial(),
    flames.length,
  );
  flameMesh.frustumCulled = false;
  flames.forEach((f, i) => flameMesh.setColorAt(i, new THREE.Color(...f[4])));
  scene.add(flameMesh);

  // 火光：登记成一盏会闪烁的灯，照亮空地和旁边的步道
  const lamp = w.pointLight(FX, 1.7, FZ, 30, 17, 0xff9448);

  // ---------- 火星 ----------
  // 前一部分是篝火平时零星升起的火星，后一部分只在烧信时出现，升得更高
  const IDLE = 46;
  const BURST = 90;
  const seed = new Float32Array((IDLE + BURST) * 4);
  for (let i = 0; i < IDLE + BURST; i++) {
    seed.set([rnd(), 0.6 + rnd() * 0.9, 0.15 + rnd() * 0.5, i < IDLE ? 0 : 1], i * 4);
  }
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((IDLE + BURST) * 3), 3));
  sparkGeo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  const sparkMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: w.uTime,
      uBurst: { value: -1 },
      uOrigin: { value: new THREE.Vector3(FX, 0, FZ) },
      uLife: { value: SPARK_LIFE },
      uSpread: { value: SPARK_SPREAD },
    },
    vertexShader: /* glsl */ `
      attribute vec4 aSeed;
      uniform float uTime; uniform float uBurst; uniform float uLife; uniform float uSpread; uniform vec3 uOrigin;
      varying float vA;
      void main() {
        vec3 p = uOrigin;
        float size;
        if (aSeed.w < 0.5) {
          float life = fract(uTime * aSeed.y * 0.22 + aSeed.x);
          float a = aSeed.x * 40.0 + life * 3.0;
          float r = aSeed.z * (0.3 + life);
          p += vec3(cos(a) * r, 0.45 + life * 2.6, sin(a) * r);
          vA = (1.0 - life) * smoothstep(0.0, 0.1, life);
          size = 34.0;
        } else {
          // 烧信时的火星：在几秒内陆续升起，一路飘向夜空
          float tt = uBurst - aSeed.x * uSpread;
          float life = tt / uLife;
          float a = aSeed.x * 60.0 + tt * 0.8;
          float r = aSeed.z * (0.2 + tt * 0.28);
          p += vec3(cos(a) * r, 0.55 + tt * (1.1 + aSeed.y), sin(a) * r);
          vA = (uBurst < 0.0 || tt < 0.0 || life > 1.0) ? 0.0 : (1.0 - life) * smoothstep(0.0, 0.06, life);
          size = 56.0;
        }
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = size / max(1.0, -mv.z);
      }`,
    fragmentShader: /* glsl */ `
      varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(vec3(2.6, 1.1, 0.35) * a * a * vA, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sparks = new THREE.Points(sparkGeo, sparkMat);
  sparks.frustumCulled = false;
  scene.add(sparks);

  // ---------- 信纸 ----------
  const paperGeo = new THREE.PlaneGeometry(0.3, 0.21, 8, 1);
  const paperBase = (paperGeo.attributes.position.array as Float32Array).slice();
  const paperMat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const paper = new THREE.Mesh(paperGeo, paperMat);
  paper.visible = false;
  scene.add(paper);
  const CREAM = new THREE.Color(0.9, 0.85, 0.74);
  const EMBER = new THREE.Color(2.4, 0.8, 0.2);
  const ASH = new THREE.Color(0.03, 0.02, 0.015);
  const from = new THREE.Vector3();
  const into = new THREE.Vector3(FX, 0.62, FZ);
  /** 烧信动画已经进行了多久；小于 0 表示没有在烧 */
  let burnT = -1;

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();

  w.updaters.push((dt, t) => {
    // 烧信期间火会旺一些
    let boost = 1;
    if (burnT >= 0) {
      burnT += dt;
      const inFire = burnT - FLY_TIME;
      sparkMat.uniforms.uBurst.value = inFire;
      if (inFire >= 0 && burnT < BF.burnTime) boost = 1 + 0.35 * Math.sin((Math.PI * inFire) / (BF.burnTime - FLY_TIME));
      updatePaper(inFire, t);
      if (inFire > SPARK_SPREAD + SPARK_LIFE) {
        burnT = -1;
        sparkMat.uniforms.uBurst.value = -1;
      }
    }

    flames.forEach(([dx, dz, r, h], i) => {
      const flick = (0.82 + 0.18 * Math.sin(t * (6.3 + i * 1.1) + i * 2.1)) * (1 + 0.22 * Math.sin(t * 2.3 + i * 1.7));
      e.set(0.09 * Math.sin(t * 3.1 + i), t * 0.5 + i, 0.09 * Math.cos(t * 2.7 + i * 1.3));
      m.compose(p.set(FX + dx, 0.12, FZ + dz), q.setFromEuler(e), s.set(r * boost, h * flick * boost, r * boost));
      flameMesh.setMatrixAt(i, m);
    });
    flameMesh.instanceMatrix.needsUpdate = true;
    lamp.intensity = 30 * boost * (0.86 + 0.1 * Math.sin(t * 7.3) * Math.sin(t * 4.1 + 1) + 0.04 * Math.sin(t * 17));
  });

  /** 信纸先沿一道弧线飞进火里，然后卷曲、发红、变黑、缩小 */
  function updatePaper(inFire: number, t: number) {
    const burnFor = BF.burnTime - FLY_TIME;
    if (inFire >= burnFor) {
      paper.visible = false;
      return;
    }
    const pos = paperGeo.attributes.position as THREE.BufferAttribute;
    let curl = 0;
    if (inFire < 0) {
      const k = 1 + inFire / FLY_TIME;
      const ease = k * k * (3 - 2 * k);
      paper.position.lerpVectors(from, into, ease);
      paper.position.y += Math.sin(Math.PI * ease) * 0.45;
      paper.rotation.set(-0.5 - ease * 0.6, FIRE_SPOT.facing + ease * 1.2, Math.sin(ease * 5) * 0.2);
      paper.scale.setScalar(1);
      paperMat.color.copy(CREAM);
    } else {
      const u = inFire / burnFor;
      curl = u * 9;
      paper.position.copy(into);
      paper.position.y = into.y - u * 0.22 + Math.sin(t * 5) * 0.012;
      paper.rotation.y += 0.004;
      paper.scale.setScalar(1 - 0.72 * u * u);
      if (u < 0.3) paperMat.color.lerpColors(CREAM, EMBER, u / 0.3);
      else paperMat.color.lerpColors(EMBER, ASH, Math.min(1, (u - 0.3) / 0.5));
    }
    for (let i = 0; i < pos.count; i++) {
      const x = paperBase[i * 3];
      pos.setZ(i, curl * x * x);
    }
    pos.needsUpdate = true;
  }

  w.proxy(FX, 0.65, FZ, 1.7, 1.3, 1.7, STR.tipFire, () => w.hooks.fire());

  return {
    burn(start) {
      from.copy(start);
      burnT = 0;
      paper.visible = true;
      updatePaper(-FLY_TIME, 0);
    },
  };
}
