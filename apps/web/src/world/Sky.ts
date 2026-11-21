import * as THREE from 'three';
import { CONFIG, ZONES } from '../config';
import { canvasTexture, FONT, glowTexture, makeCanvas } from './textures';

const R = 380;
/** 月亮所在的方向（同时也是月光的方向） */
export const MOON_DIR = new THREE.Vector3(-0.55, 0.5, -0.67).normalize();

interface Meteor {
  mesh: THREE.Mesh;
  head: THREE.Vector3;
  dir: THREE.Vector3;
  len: number;
  speed: number;
  life: number;
  age: number;
}

interface UserLantern {
  group: THREE.Group;
  mat: THREE.MeshBasicMaterial;
  label: THREE.Sprite;
  speed: number;
  phase: number;
  age: number;
}

/** 夜空：渐变天穹、星星、银河、月亮、流星、孔明灯 */
export class Sky {
  /** 跟随相机移动的天穹元素 */
  private dome = new THREE.Group();
  private starMat: THREE.ShaderMaterial;
  private meteors: Meteor[] = [];
  private meteorTimer = 1;
  private meteorTex: THREE.Texture;

  private lanternMesh: THREE.InstancedMesh;
  private lanternTex: THREE.Texture;
  private lanternGeo: THREE.BufferGeometry;
  private lx: Float32Array;
  private ly: Float32Array;
  private lz: Float32Array;
  private lspeed: Float32Array;
  private lphase: Float32Array;
  private lscale: Float32Array;
  private userLanterns: UserLantern[] = [];
  private maxY = 95;

  constructor(private scene: THREE.Scene) {
    scene.add(this.dome);

    // --- 天穹 ---
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color(0x03040f) },
        mid: { value: new THREE.Color(0x0b1036) },
        horizon: { value: new THREE.Color(0x2b2452) },
        bandDir: { value: new THREE.Vector3(0.55, 0.3, -0.78).normalize() },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 top; uniform vec3 mid; uniform vec3 horizon; uniform vec3 bandDir;
        varying vec3 vDir;
        float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
        float noise(vec3 p) {
          vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
                     mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
        }
        void main() {
          vec3 d = normalize(vDir);
          float h = max(d.y, 0.0);
          vec3 col = mix(horizon, mid, smoothstep(0.0, 0.32, h));
          col = mix(col, top, smoothstep(0.28, 1.0, h));
          // 银河
          float b = abs(dot(d, bandDir));
          float n = noise(d * 5.0) * 0.6 + noise(d * 11.0) * 0.4;
          float band = exp(-b * b * 16.0) * (0.35 + 0.9 * n) * smoothstep(0.02, 0.35, h);
          col += vec3(0.085, 0.075, 0.15) * band;
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(R + 20, 32, 20), skyMat);
    sky.renderOrder = -10;
    this.dome.add(sky);

    // --- 星星 ---
    const { stars, bandStars } = CONFIG.sky;
    const n = stars + bandStars;
    const pos = new Float32Array(n * 3);
    const size = new Float32Array(n);
    const phase = new Float32Array(n);
    const col = new Float32Array(n * 3);
    const bandDir = skyMat.uniforms.bandDir.value as THREE.Vector3;
    const v = new THREE.Vector3();
    const tints = [new THREE.Color(0xffffff), new THREE.Color(0xbfd4ff), new THREE.Color(0xfff0cf), new THREE.Color(0xffd6c2)];
    for (let i = 0; i < n; i++) {
      let guard = 0;
      do {
        v.set(Math.random() * 2 - 1, Math.random() * 1.05 - 0.05, Math.random() * 2 - 1);
        if (v.lengthSq() > 1 || v.lengthSq() < 0.01) continue;
        v.normalize();
        // 银河带上的星星更密
        if (i < stars || Math.abs(v.dot(bandDir)) < 0.22 * Math.random()) break;
      } while (guard++ < 60);
      v.normalize().multiplyScalar(R);
      pos.set([v.x, v.y, v.z], i * 3);
      const big = Math.random() < 0.06;
      size[i] = big ? 3.2 + Math.random() * 2.2 : 1.0 + Math.random() * 1.6;
      phase[i] = Math.random() * Math.PI * 2;
      const c = tints[Math.floor(Math.random() * tints.length)];
      const k = (big ? 1.5 : 0.55 + Math.random() * 0.6) * (i < stars ? 1 : 0.7);
      col.set([c.r * k, c.g * k, c.b * k], i * 3);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    starGeo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    starGeo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    starGeo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    this.starMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
      uniforms: { uTime: { value: 0 }, uScale: { value: 1 } },
      vertexShader: /* glsl */ `
        attribute float aSize; attribute float aPhase; attribute vec3 aColor;
        uniform float uTime; uniform float uScale;
        varying vec3 vColor; varying float vTw;
        void main() {
          vTw = 0.72 + 0.28 * sin(uTime * (0.6 + fract(aPhase) * 1.8) + aPhase);
          vColor = aColor;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uScale * (0.85 + 0.3 * vTw);
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vColor; varying float vTw;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.05, d);
          gl_FragColor = vec4(vColor * vTw * a, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const starPoints = new THREE.Points(starGeo, this.starMat);
    starPoints.frustumCulled = false;
    starPoints.renderOrder = -9;
    this.dome.add(starPoints);

    // --- 月亮 ---
    const [mc, mctx] = makeCanvas(256, 256);
    const halo = mctx.createRadialGradient(128, 128, 20, 128, 128, 128);
    halo.addColorStop(0, 'rgba(200,215,255,0.55)');
    halo.addColorStop(0.3, 'rgba(160,180,255,0.16)');
    halo.addColorStop(1, 'rgba(120,140,255,0)');
    mctx.fillStyle = halo;
    mctx.fillRect(0, 0, 256, 256);
    const disc = mctx.createRadialGradient(118, 118, 4, 128, 128, 34);
    disc.addColorStop(0, '#ffffff');
    disc.addColorStop(1, '#e6ecff');
    mctx.fillStyle = disc;
    mctx.beginPath();
    mctx.arc(128, 128, 32, 0, Math.PI * 2);
    mctx.fill();
    mctx.fillStyle = 'rgba(170,185,225,0.35)';
    for (const [x, y, r] of [[116, 120, 7], [140, 134, 5], [130, 112, 4], [121, 142, 4]]) {
      mctx.beginPath();
      mctx.arc(x, y, r, 0, Math.PI * 2);
      mctx.fill();
    }
    const moon = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: canvasTexture(mc),
        color: new THREE.Color(1.1, 1.1, 1.18),
        transparent: true,
        depthWrite: false,
        fog: false,
      }),
    );
    moon.position.copy(MOON_DIR).multiplyScalar(R - 20);
    moon.scale.setScalar(105);
    moon.renderOrder = -8;
    this.dome.add(moon);

    // --- 流星 ---
    const [tc, tctx] = makeCanvas(256, 16);
    const tg = tctx.createLinearGradient(0, 0, 256, 0);
    tg.addColorStop(0, 'rgba(255,255,255,0)');
    tg.addColorStop(0.7, 'rgba(255,255,255,0.35)');
    tg.addColorStop(1, 'rgba(255,255,255,1)');
    tctx.fillStyle = tg;
    tctx.fillRect(0, 0, 256, 16);
    tctx.globalCompositeOperation = 'destination-in';
    const vg = tctx.createLinearGradient(0, 0, 0, 16);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(0.5, 'rgba(0,0,0,1)');
    vg.addColorStop(1, 'rgba(0,0,0,0)');
    tctx.fillStyle = vg;
    tctx.fillRect(0, 0, 256, 16);
    this.meteorTex = canvasTexture(tc);
    const meteorGeo = new THREE.PlaneGeometry(1, 1).translate(-0.5, 0, 0);
    for (let i = 0; i < 4; i++) {
      const mesh = new THREE.Mesh(
        meteorGeo,
        new THREE.MeshBasicMaterial({
          map: this.meteorTex,
          color: new THREE.Color(2.4, 2.6, 3.4),
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          fog: false,
          side: THREE.DoubleSide,
        }),
      );
      mesh.matrixAutoUpdate = false;
      mesh.visible = false;
      mesh.frustumCulled = false;
      this.dome.add(mesh);
      this.meteors.push({ mesh, head: new THREE.Vector3(), dir: new THREE.Vector3(), len: 0, speed: 0, life: 0, age: 0 });
    }

    // --- 孔明灯 ---
    const [lc, lctx] = makeCanvas(32, 128);
    const lg = lctx.createLinearGradient(0, 0, 0, 128);
    lg.addColorStop(0, '#c9541a');
    lg.addColorStop(0.55, '#ff9a3c');
    lg.addColorStop(1, '#fff0c0');
    lctx.fillStyle = lg;
    lctx.fillRect(0, 0, 32, 128);
    this.lanternTex = canvasTexture(lc);
    this.lanternGeo = new THREE.CylinderGeometry(0.42, 0.28, 0.95, 8);
    const count = CONFIG.sky.lanterns;
    this.lanternMesh = new THREE.InstancedMesh(
      this.lanternGeo,
      new THREE.MeshBasicMaterial({ map: this.lanternTex, fog: false }),
      count,
    );
    this.lanternMesh.frustumCulled = false;
    this.lanternMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3).fill(1.6), 3);
    scene.add(this.lanternMesh);
    this.lx = new Float32Array(count);
    this.ly = new Float32Array(count);
    this.lz = new Float32Array(count);
    this.lspeed = new Float32Array(count);
    this.lphase = new Float32Array(count);
    this.lscale = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      this.respawnLantern(i);
      this.ly[i] = Math.random() * this.maxY;
    }
  }

  private respawnLantern(i: number) {
    // 从纪念馆四周的空地升起，避开建筑内部
    let x = 0;
    let z = 0;
    for (let k = 0; k < 20; k++) {
      x = (Math.random() * 2 - 1) * 75;
      z = 70 - Math.random() * 175;
      const inHall = Math.abs(x) < 14 && z < 2 && z > ZONES.hallBack - 2;
      const onPath = Math.abs(x) < 4 && z >= 0 && z < 55;
      if (!inHall && !onPath) break;
    }
    this.lx[i] = x;
    this.lz[i] = z;
    this.ly[i] = 0.5;
    this.lspeed[i] = 0.55 + Math.random() * 0.7;
    this.lphase[i] = Math.random() * Math.PI * 2;
    this.lscale[i] = 0.9 + Math.random() * 0.9;
  }

  /** 访客亲手放飞的孔明灯，下面挂着写的话 */
  launch(from: THREE.Vector3, text: string) {
    const group = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({
      map: this.lanternTex,
      color: new THREE.Color(1.9, 1.9, 1.9),
      fog: false,
      transparent: true,
    });
    const body = new THREE.Mesh(this.lanternGeo, mat);
    group.add(body);

    const font = `600 44px ${FONT}`;
    const [m, mctx] = makeCanvas(4, 4);
    void m;
    mctx.font = font;
    const w = Math.min(1024, Math.ceil(mctx.measureText(text).width) + 40);
    const [c, ctx] = makeCanvas(w, 72);
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffe9c4';
    ctx.shadowColor = 'rgba(255,150,60,0.9)';
    ctx.shadowBlur = 12;
    ctx.fillText(text, w / 2, 38, w - 20);
    const label = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: canvasTexture(c), transparent: true, depthWrite: false, fog: false }),
    );
    label.scale.set((0.34 * w) / 72, 0.34, 1);
    label.position.y = -0.85;
    group.add(label);

    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture(),
        color: new THREE.Color(1.2, 0.6, 0.2),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      }),
    );
    glow.scale.setScalar(3.2);
    group.add(glow);

    group.position.copy(from);
    this.scene.add(group);
    this.userLanterns.push({ group, mat, label, speed: 0.75, phase: Math.random() * 6, age: 0 });
  }

  private spawnMeteor() {
    const m = this.meteors.find((x) => !x.mesh.visible);
    if (!m) return;
    const az = Math.random() * Math.PI * 2;
    const el = 0.3 + Math.random() * 0.75;
    m.head.set(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)).multiplyScalar(R - 30);
    // 在切平面内选一个偏向下方的方向
    const radial = m.head.clone().normalize();
    m.dir.set(Math.random() * 2 - 1, -0.4 - Math.random() * 0.8, Math.random() * 2 - 1);
    m.dir.addScaledVector(radial, -m.dir.dot(radial)).normalize();
    m.len = 35 + Math.random() * 45;
    m.speed = 150 + Math.random() * 130;
    m.life = 0.7 + Math.random() * 0.7;
    m.age = 0;
    m.mesh.visible = true;
  }

  update(dt: number, t: number, camera: THREE.Camera, pixelRatio: number) {
    this.dome.position.copy(camera.position);
    this.starMat.uniforms.uTime.value = t;
    this.starMat.uniforms.uScale.value = pixelRatio;

    // 流星
    this.meteorTimer -= dt;
    if (this.meteorTimer <= 0) {
      this.spawnMeteor();
      const [a, b] = CONFIG.sky.meteorInterval;
      this.meteorTimer = a + Math.random() * (b - a);
    }
    const X = _v1;
    const Y = _v2;
    const Z = _v3;
    for (const m of this.meteors) {
      if (!m.mesh.visible) continue;
      m.age += dt;
      if (m.age >= m.life) {
        m.mesh.visible = false;
        continue;
      }
      m.head.addScaledVector(m.dir, m.speed * dt);
      const k = m.age / m.life;
      (m.mesh.material as THREE.MeshBasicMaterial).opacity = Math.sin(k * Math.PI);
      const len = m.len * Math.min(1, k * 3);
      X.copy(m.dir);
      Z.copy(m.head).normalize().negate();
      Y.crossVectors(Z, X).normalize();
      Z.crossVectors(X, Y);
      m.mesh.matrix.makeBasis(X.multiplyScalar(len), Y.multiplyScalar(1.5), Z).setPosition(m.head);
      m.mesh.matrixWorldNeedsUpdate = true;
    }

    // 孔明灯
    const col = this.lanternMesh.instanceColor!;
    for (let i = 0; i < this.lx.length; i++) {
      this.ly[i] += this.lspeed[i] * dt;
      if (this.ly[i] > this.maxY) this.respawnLantern(i);
      const y = this.ly[i];
      const ph = this.lphase[i];
      // 起飞时慢慢长大，快到顶时慢慢缩小消失
      const s = this.lscale[i] * Math.min(1, y / 3) * Math.min(1, (this.maxY - y) / 12);
      _q.setFromEuler(_e.set(Math.sin(t * 0.5 + ph) * 0.06, ph, Math.cos(t * 0.4 + ph) * 0.06));
      _m.compose(
        _v1.set(this.lx[i] + Math.sin(t * 0.25 + ph) * 1.6 + y * 0.06, y, this.lz[i] + Math.cos(t * 0.2 + ph * 1.7) * 1.6),
        _q,
        _v2.setScalar(s),
      );
      this.lanternMesh.setMatrixAt(i, _m);
      const f = 1.45 + 0.3 * Math.sin(t * 7 + ph * 5) * Math.sin(t * 3.1 + ph);
      col.setXYZ(i, f, f, f);
    }
    this.lanternMesh.instanceMatrix.needsUpdate = true;
    col.needsUpdate = true;

    for (let i = this.userLanterns.length - 1; i >= 0; i--) {
      const u = this.userLanterns[i];
      u.age += dt;
      const p = u.group.position;
      p.y += u.speed * Math.min(1, u.age / 2) * dt;
      p.x += (Math.sin(t * 0.3 + u.phase) * 0.25 + 0.05) * dt;
      p.z += Math.cos(t * 0.24 + u.phase) * 0.25 * dt;
      u.group.rotation.y += dt * 0.15;
      const f = 1.8 + 0.25 * Math.sin(t * 8 + u.phase);
      u.mat.color.setScalar(f);
      // 升高后文字慢慢隐去
      u.label.material.opacity = THREE.MathUtils.clamp(1 - (p.y - 14) / 10, 0, 1);
      if (p.y > this.maxY) {
        this.scene.remove(u.group);
        u.mat.dispose();
        u.label.material.map?.dispose();
        u.label.material.dispose();
        this.userLanterns.splice(i, 1);
      }
    }
  }
}

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _m = new THREE.Matrix4();
