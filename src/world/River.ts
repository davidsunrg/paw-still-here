import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG, RIVER_BANKS } from '../config';
import { mulberry32 } from '../data/pets';
import { STR } from '../strings';
import { BRIDGE_X, DOCK_X } from './Outdoor';
import { canvasTexture, FONT, glowTexture, makeCanvas } from './textures';
import type { World } from './World';

const RV = CONFIG.river;
const { north: Z_N, south: Z_S } = RIVER_BANKS;
/** 码头伸进河里的那一端 */
const DOCK_END = Z_S - RV.dock.len;
/** 河灯放下水的位置 */
const LAUNCH = new THREE.Vector3(DOCK_X, RV.level, DOCK_END - 0.55);

/** 站在码头上放河灯的位置和朝向：斜对着下游、略微低头，放下的河灯会从眼前漂向远处 */
export const DOCK_SPOT = { x: DOCK_X - 0.3, z: DOCK_END + 0.8, yaw: -0.6, pitch: -0.42 };

/** 桥面在 z 处的高度：两端平滑地接到地面，中间拱起 */
function deckHeight(z: number) {
  const d = Math.abs(z - RV.z);
  const half = RV.bridge.len / 2;
  return d >= half ? 0 : RV.bridge.rise * 0.5 * (1 + Math.cos((Math.PI * d) / half));
}

/** 访客脚下的地面高度：只有桥面高出地面 */
function heightAt(x: number, z: number) {
  return Math.abs(x - BRIDGE_X) < RV.bridge.halfW ? deckHeight(z) : 0;
}

interface Lantern {
  x: number;
  z: number;
  phase: number;
  speed: number;
  /** 访客放的河灯：带名字，漂远后淡出并移除；平时漂着的那些则循环出现 */
  label: THREE.Sprite | null;
  /** 刚放下水时的下落进度 0–1 */
  drop: number;
  /** 当前的淡出程度和离水面的高度，每帧更新 */
  fade: number;
  lift: number;
}

/** 河面上漂着的河灯。所有河灯共用三个实例化网格：莲花灯座、烛光、水面上的倒影光晕。 */
class RiverLanterns {
  private items: Lantern[] = [];
  private cups: THREE.InstancedMesh;
  private cores: THREE.InstancedMesh;
  private glows: THREE.InstancedMesh;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3();
  private c = new THREE.Color();

  constructor(private scene: THREE.Scene) {
    const cap = RV.presetLanterns + RV.maxUserLanterns;

    // 莲花灯座：两层开口朝上的花瓣
    const outer = new THREE.ConeGeometry(0.2, 0.1, 8, 1, true).rotateX(Math.PI).translate(0, 0.05, 0);
    const inner = new THREE.ConeGeometry(0.13, 0.15, 8, 1, true).rotateX(Math.PI).rotateY(Math.PI / 8).translate(0, 0.075, 0);
    this.cups = new THREE.InstancedMesh(
      mergeGeometries([outer, inner]),
      new THREE.MeshStandardMaterial({
        color: 0xf7b3c2,
        emissive: 0xff8a5c,
        emissiveIntensity: 0.55,
        roughness: 0.9,
        flatShading: true,
        side: THREE.DoubleSide,
      }),
      cap,
    );
    this.cores = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.04, 0.04, 0.09, 8).translate(0, 0.075, 0),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc070).multiplyScalar(2.6) }),
      cap,
    );
    this.glows = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        map: glowTexture(),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
      cap,
    );
    for (const mesh of [this.cups, this.cores, this.glows]) {
      mesh.count = 0;
      mesh.frustumCulled = false;
      scene.add(mesh);
    }
    this.glows.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);

    const rnd = mulberry32(31);
    const span = RV.halfLength - 12;
    for (let i = 0; i < RV.presetLanterns; i++) {
      this.items.push({
        x: -span + rnd() * span * 2,
        z: RV.z + (rnd() * 2 - 1),
        phase: rnd() * 6.28,
        speed: RV.flow * (0.8 + rnd() * 0.4),
        label: null,
        drop: 1,
        fade: 1,
        lift: 0,
      });
    }
  }

  /** 从码头放下一盏写着名字的河灯 */
  launch(name: string) {
    const users = this.items.filter((l) => l.label);
    if (users.length >= RV.maxUserLanterns) this.remove(users[0]);

    const font = `600 44px ${FONT}`;
    const [, mctx] = makeCanvas(4, 4);
    mctx.font = font;
    const w = Math.ceil(mctx.measureText(name).width) + 40;
    const [c, ctx] = makeCanvas(w, 72);
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff6e2';
    ctx.shadowColor = 'rgba(120,50,10,0.95)';
    ctx.shadowBlur = 10;
    ctx.fillText(name, w / 2, 38);
    ctx.fillText(name, w / 2, 38);
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTexture(c), color: new THREE.Color(1.7, 1.7, 1.7), transparent: true, depthWrite: false }));
    label.scale.set((0.26 * w) / 72, 0.26, 1);
    this.scene.add(label);

    this.items.push({ x: LAUNCH.x, z: LAUNCH.z, phase: Math.random() * 6.28, speed: RV.flow, label, drop: 0, fade: 1, lift: 0.45 });
  }

  private remove(l: Lantern) {
    this.items.splice(this.items.indexOf(l), 1);
    if (!l.label) return;
    this.scene.remove(l.label);
    l.label.material.map?.dispose();
    l.label.material.dispose();
  }

  update(dt: number, t: number) {
    const span = RV.halfLength - 12;
    // 先推进每盏灯的状态并移除已经淡出的，再统一写入实例矩阵
    for (let i = this.items.length - 1; i >= 0; i--) {
      const l = this.items[i];
      if (l.label) {
        // 先轻轻放到水面上，再慢慢漂向河心，随水流远去
        l.drop = Math.min(1, l.drop + dt / 1.4);
        const k = 1 - Math.pow(1 - l.drop, 3);
        l.lift = 0.45 * (1 - k);
        l.x += l.speed * dt * k;
        l.z += (RV.z + 0.3 - l.z) * dt * 0.12 * k;
        l.fade = 1 - THREE.MathUtils.smoothstep(l.x - LAUNCH.x, RV.fadeDistance - 14, RV.fadeDistance);
        if (l.fade <= 0) this.remove(l);
      } else {
        l.x += l.speed * dt;
        if (l.x > span) l.x = -span;
      }
    }

    this.items.forEach((l, i) => {
      const { fade, lift } = l;
      const z = l.z + Math.sin(t * 0.3 + l.phase) * 0.22;
      const y = RV.level + 0.015 + lift + Math.sin(t * 1.3 + l.phase) * 0.012;
      this.e.set(Math.sin(t * 0.9 + l.phase) * 0.04, l.phase + t * 0.08, Math.cos(t * 0.7 + l.phase) * 0.04);
      this.q.setFromEuler(this.e);
      this.m.compose(this.p.set(l.x, y, z), this.q, this.s.setScalar(fade));
      this.cups.setMatrixAt(i, this.m);
      this.cores.setMatrixAt(i, this.m);

      // 水面上的倒影光晕：贴着水面，不跟着河灯晃动
      const flicker = 0.85 + 0.15 * Math.sin(t * 2.3 + l.phase * 3);
      this.m.makeScale(2.4, 1, 2.4).setPosition(l.x, RV.level + 0.012, z);
      this.glows.setMatrixAt(i, this.m);
      this.glows.setColorAt(i, this.c.setRGB(1, 0.55, 0.22).multiplyScalar(0.55 * fade * flicker * (1 - lift * 2)));

      if (l.label) {
        l.label.position.set(l.x, y + 0.42, z);
        l.label.material.opacity = fade;
      }
    });
    for (const mesh of [this.cups, this.cores, this.glows]) {
      mesh.count = this.items.length;
      mesh.instanceMatrix.needsUpdate = true;
    }
    if (this.glows.instanceColor) this.glows.instanceColor.needsUpdate = true;
  }
}

export interface River {
  /** 从码头放下一盏写着名字的河灯 */
  launch(name: string): void;
}

/** 搭建河流：河床、水面、石拱桥、码头，以及河面上的河灯 */
export function buildRiver(w: World): River {
  const { kit, scene } = w;
  const C = CONFIG.colors;
  const rnd = mulberry32(41);
  const R = (a: number, b: number) => a + rnd() * (b - a);
  const L = RV.halfLength;
  const bed = -RV.depth;

  // ---------- 河床：两侧岸坡 + 河底 ----------
  const profile: Array<[number, number]> = [
    [Z_S, 0], [Z_S - RV.bank, bed], [Z_N + RV.bank, bed], [Z_N, 0],
  ];
  const pos: number[] = [];
  for (let i = 0; i < profile.length - 1; i++) {
    const [z0, y0] = profile[i];
    const [z1, y1] = profile[i + 1];
    pos.push(-L, y0, z0, L, y0, z0, L, y1, z1, -L, y0, z0, L, y1, z1, -L, y1, z1);
  }
  const bedGeo = new THREE.BufferGeometry();
  bedGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  bedGeo.computeVertexNormals();
  scene.add(new THREE.Mesh(bedGeo, new THREE.MeshStandardMaterial({ color: 0x2c4a36, roughness: 1 })));

  // ---------- 水面 ----------
  const fog = new THREE.Color(C.fog);
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(L * 2, RV.width + RV.bank * 1.3).rotateX(-Math.PI / 2),
    new THREE.ShaderMaterial({
      transparent: true,
      uniforms: {
        uTime: w.uTime,
        uCam: { value: new THREE.Vector3() },
        uFog: { value: fog },
        uFlow: { value: RV.flow },
      },
      vertexShader: /* glsl */ `
        varying vec3 vW;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vW = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform float uFlow; uniform vec3 uCam; uniform vec3 uFog;
        varying vec3 vW;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) {
          vec2 i = floor(p); vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                     mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
        }
        void main() {
          // 波纹顺着水流方向（+x）缓缓移动
          vec2 q = vec2(vW.x - uTime * uFlow, vW.z);
          float n = noise(q * vec2(0.8, 2.4)) * 0.6 + noise(q * vec2(2.1, 5.5) + vec2(uTime * 0.07, 3.1)) * 0.4;
          float ripple = smoothstep(0.58, 0.86, n);
          vec3 v = normalize(uCam - vW);
          float fres = pow(1.0 - max(v.y, 0.0), 3.0);
          // 近处看是深色的水，远处掠着看映出夜空
          vec3 col = mix(vec3(0.012, 0.022, 0.05), vec3(0.07, 0.1, 0.22), 0.2 + 0.8 * fres);
          col += ripple * vec3(0.06, 0.08, 0.15) * (0.2 + fres);
          // 零星的星光倒影：每个小格子里最多一个柔和的圆点，忽明忽暗
          vec2 sq = q * vec2(5.0, 9.0);
          vec2 cell = floor(sq);
          float dot_ = smoothstep(0.32, 0.0, length(fract(sq) - 0.5));
          float spark = step(0.975, hash(cell)) * dot_ * (0.5 + 0.5 * sin(uTime * 2.2 + hash(cell + 1.7) * 40.0));
          col += spark * vec3(0.4, 0.45, 0.65) * (0.15 + fres);
          float d = length(uCam - vW);
          col = mix(col, uFog, 1.0 - exp(-0.000121 * d * d));
          gl_FragColor = vec4(col, 0.94);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }),
  );
  water.position.set(0, RV.level, RV.z);
  scene.add(water);
  w.updaters.push((_dt, _t, player) => (water.material.uniforms.uCam.value as THREE.Vector3).copy(player));

  // 岸边零散的石头，遮住草地和岸坡的接缝
  for (let x = -60; x < 60; x += R(0.9, 2.4)) {
    if (Math.abs(x - BRIDGE_X) < RV.bridge.halfW + 0.4 || Math.abs(x - DOCK_X) < RV.dock.w / 2 + 0.3) continue;
    const south = rnd() < 0.5;
    const g = Math.round(R(95, 135));
    kit.ball(x, R(-0.08, 0.02), (south ? Z_S : Z_N) + R(-0.22, 0.12), R(0.14, 0.34), (g << 16) | (g << 8) | (g - 6), R(0.5, 0.8), R(0, 6));
  }

  // ---------- 石拱桥 ----------
  const B = RV.bridge;
  const half = B.len / 2;
  const span = RV.width / 2 - 0.1;
  const step = 0.32;
  const railX = B.halfW - 0.13;
  for (let z = RV.z - half + step / 2; z < RV.z + half; z += step) {
    const d = Math.abs(z - RV.z);
    const top = deckHeight(z);
    // 桥洞：中间一段的桥身底面沿拱形抬高，让河水和河灯从下面穿过
    const arch = d < span ? bed + (B.rise + RV.depth - 0.2) * Math.sqrt(1 - (d / span) ** 2) : bed;
    const under = Math.min(arch, top - 0.2);
    const g = Math.round(R(128, 150));
    const stone = (g << 16) | ((g - 3) << 8) | (g - 9);
    kit.box(BRIDGE_X, (top + under) / 2, z, B.halfW * 2, top - under, step + 0.012, stone);
    for (const sx of [-1, 1]) {
      kit.box(BRIDGE_X + sx * railX, top + B.rail / 2, z, 0.24, B.rail, step + 0.012, 0x9d9990);
      kit.box(BRIDGE_X + sx * railX, top + B.rail + 0.03, z, 0.3, 0.06, step + 0.012, 0xb3aea4);
    }
  }
  // 桥头四根灯柱
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const x = BRIDGE_X + sx * railX;
      const z = RV.z + sz * (half + 0.08);
      kit.box(x, 0.5, z, 0.36, 1.0, 0.36, 0x9d9990);
      kit.box(x, 1.03, z, 0.44, 0.06, 0.44, 0xb3aea4);
      kit.glowBall(x, 1.2, z, 0.13, C.warm, 2.6);
      w.collide(x, z, 0.4, 0.4);
    }
    // 护栏：访客不会从桥的两侧掉下去
    w.collide(BRIDGE_X + sx * railX, RV.z, 0.26, B.len);
    // 灯光在水面上的倒影
    kit.pool(BRIDGE_X + sx * (B.halfW + 1.2), RV.z, 5, C.warm, 0.16, RV.level + 0.008);
  }
  w.pointLight(BRIDGE_X, 1.9, RV.z, 34, 15);

  // ---------- 码头 ----------
  const D = RV.dock;
  const deckY = 0.05;
  for (let z = Z_S + 0.55; z > DOCK_END; z -= 0.3) {
    const g = R(0.9, 1.08);
    const wood = new THREE.Color(C.woodLight).multiplyScalar(g).getHex();
    kit.box(DOCK_X, deckY - 0.03, z - 0.15, D.w, 0.06, 0.285, wood);
  }
  for (const sx of [-1, 1]) {
    kit.box(DOCK_X + sx * (D.w / 2 - 0.06), deckY - 0.1, (Z_S + 0.55 + DOCK_END) / 2, 0.1, 0.1, Z_S + 0.55 - DOCK_END, C.woodDark);
    for (const z of [DOCK_END + 0.1, Z_S - 0.9]) kit.cyl(DOCK_X + sx * (D.w / 2 - 0.06), bed, z, 0.07, deckY - bed + 0.12, C.woodDark);
  }
  // 码头入口的灯杆（立在岸上，不挡住看河面的视线）
  const px = DOCK_X - D.w / 2 - 0.15;
  const pz = Z_S + 0.35;
  kit.cyl(px, 0, pz, 0.05, 2.5, C.woodDark);
  kit.box(px + 0.26, 2.45, pz, 0.6, 0.05, 0.05, C.woodDark);
  kit.glowBox(px + 0.5, 2.2, pz, 0.2, 0.28, 0.2, C.warm, 2.8);
  kit.cone(px + 0.5, 2.34, pz, 0.19, 0.12, 0x2b2b33);
  w.collide(px, pz, 0.3, 0.3);
  w.pointLight(DOCK_X, 2.1, Z_S - 0.4, 13, 12);
  // 码头尽头两根木桩上的小灯
  for (const sx of [-1, 1]) kit.glowBall(DOCK_X + sx * (D.w / 2 - 0.06), deckY + 0.2, DOCK_END + 0.1, 0.045, C.warm, 1.6);
  kit.pool(DOCK_X, DOCK_END - 1.0, 4.5, C.warm, 0.2, RV.level + 0.008);

  // 码头上摆着河灯的小木台，点击它就可以放河灯
  const tx = DOCK_X + D.w / 2 - 0.42;
  const tz = DOCK_END + 0.45;
  kit.box(tx, deckY + 0.24, tz, 0.6, 0.06, 0.7, C.wood);
  for (const [dx, dz] of [[-0.24, -0.29], [0.24, -0.29], [-0.24, 0.29], [0.24, 0.29]]) {
    kit.box(tx + dx, deckY + 0.105, tz + dz, 0.06, 0.21, 0.06, C.woodDark);
  }
  for (const [dx, dz] of [[-0.1, -0.16], [0.08, 0.14]]) {
    kit.cyl(tx + dx, deckY + 0.27, tz + dz, 0.12, 0.05, 0xf7b3c2);
    kit.glowCyl(tx + dx, deckY + 0.32, tz + dz, 0.03, 0.05, 0xffc070, 1.3);
  }
  w.proxy(tx, deckY + 0.42, tz, 0.7, 0.5, 0.8, STR.tipDock, () => w.hooks.river());
  w.collide(tx, tz, 0.6, 0.7);

  // ---------- 碰撞：两岸不能走进水里，只能上桥或上码头 ----------
  const dockL = DOCK_X - D.w / 2;
  const dockR = DOCK_X + D.w / 2;
  const bankZ = (Z_N + Z_S) / 2;
  const bankD = Z_S - Z_N - 0.3;
  const strip = (x0: number, x1: number) => w.collide((x0 + x1) / 2, bankZ, x1 - x0, bankD);
  strip(-L, BRIDGE_X - B.halfW);
  strip(BRIDGE_X + B.halfW, dockL);
  strip(dockR, L);
  // 码头尽头
  w.collide(DOCK_X, (Z_N + DOCK_END) / 2, D.w, DOCK_END - Z_N);

  w.heightAt = heightAt;

  const lanterns = new RiverLanterns(scene);
  w.updaters.push((dt, t) => lanterns.update(dt, t));
  return { launch: (name) => lanterns.launch(name) };
}

/** 从访客所在位置走到码头的路线（用于地面光点指引） */
export function routeToDock(from: THREE.Vector3): THREE.Vector3[] {
  const pts = [new THREE.Vector3(from.x, 0, from.z)];
  // 在河对岸时先过桥
  if (from.z < RV.z) {
    pts.push(new THREE.Vector3(BRIDGE_X, 0, Z_N - 0.8), new THREE.Vector3(BRIDGE_X, 0, Z_S + 1.2));
  }
  pts.push(new THREE.Vector3(DOCK_X, 0, Z_S + 1.0), new THREE.Vector3(DOCK_SPOT.x, 0, DOCK_SPOT.z));
  return pts;
}
