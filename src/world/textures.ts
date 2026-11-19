import * as THREE from 'three';
import type { Pet } from '../data/pets';

export const FONT = '"Songti SC", "Noto Serif SC", "STSong", "SimSun", serif';

export function makeCanvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!] as const;
}

export function canvasTexture(c: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

let _glow: THREE.Texture | undefined;
/** 柔和的径向光斑，用于地面光晕、月亮光晕等 */
export function glowTexture() {
  if (_glow) return _glow;
  const [c, ctx] = makeCanvas(128, 128);
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.14)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return (_glow = canvasTexture(c));
}

export function drawPaw(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(cx, cy + s * 0.16, s * 0.25, s * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();
  const toes: Array<[number, number, number]> = [
    [-0.28, -0.08, -0.35],
    [-0.1, -0.26, -0.1],
    [0.1, -0.26, 0.1],
    [0.28, -0.08, 0.35],
  ];
  for (const [x, y, r] of toes) {
    ctx.beginPath();
    ctx.ellipse(cx + x * s, cy + y * s, s * 0.085, s * 0.115, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

let _paw: THREE.Texture | undefined;
export function pawTexture() {
  if (_paw) return _paw;
  const [c, ctx] = makeCanvas(128, 128);
  drawPaw(ctx, 64, 64, 110, '#ffffff');
  return (_paw = canvasTexture(c));
}

export interface TextOpts {
  /** 文字在世界中的高度（米） */
  height: number;
  color?: string;
  /** 大于 0 时文字自发光，数值越大辉光越强 */
  glow?: number;
  weight?: string;
}

/** 生成一块带文字的平面 */
export function textMesh(text: string, o: TextOpts) {
  const fs = 96;
  const font = `${o.weight ?? '600'} ${fs}px ${FONT}`;
  const [m, mctx] = makeCanvas(4, 4);
  mctx.font = font;
  const w = Math.ceil(mctx.measureText(text).width) + 48;
  const h = 136;
  void m;
  const [c, ctx] = makeCanvas(w, h);
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = o.glow ? '#ffffff' : (o.color ?? '#ffffff');
  ctx.fillText(text, w / 2, h / 2 + 4);
  const mat = new THREE.MeshBasicMaterial({ map: canvasTexture(c), transparent: true, depthWrite: false });
  if (o.glow) mat.color = new THREE.Color(o.color ?? '#ffd9a0').multiplyScalar(o.glow);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry((o.height * w) / h, o.height), mat);
  return mesh;
}

/** 木地板纹理 */
export function plankTexture() {
  const [c, ctx] = makeCanvas(512, 512);
  const rows = 8;
  const rh = 512 / rows;
  for (let r = 0; r < rows; r++) {
    let x = -((r * 173) % 256);
    while (x < 512) {
      const w = 180 + ((r * 97 + x * 13) % 140);
      const l = 46 + (((r * 31 + x * 7) % 13) - 6);
      ctx.fillStyle = `hsl(28, 34%, ${l}%)`;
      ctx.fillRect(x, r * rh, w, rh);
      ctx.strokeStyle = 'rgba(40,22,10,0.45)';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, r * rh + 1, w - 2, rh - 2);
      x += w;
    }
  }
  const t = canvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** 石砖地面纹理 */
export function tileTexture(base = 220, tint = 12) {
  const [c, ctx] = makeCanvas(512, 512);
  const n = 4;
  const s = 512 / n;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const l = base + (((i * 7 + j * 13) % 5) - 2) * 3;
      ctx.fillStyle = `rgb(${l},${l - 4},${l - tint})`;
      ctx.fillRect(i * s, j * s, s, s);
      ctx.strokeStyle = 'rgba(60,55,50,0.5)';
      ctx.lineWidth = 3;
      ctx.strokeRect(i * s, j * s, s, s);
    }
  }
  const t = canvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// ---------- 宠物占位画像 ----------

const BGS: Array<[string, string]> = [
  ['#fbe9db', '#f1c4a8'],
  ['#e3edf9', '#b4cbe9'],
  ['#e8f3e3', '#b9d8b1'],
  ['#f7e8f4', '#dbb9d9'],
  ['#fdf3d4', '#f1d386'],
  ['#e7e4f8', '#bdb8e6'],
];

function shade(hex: string, f: number) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${ch((n >> 16) & 255)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
}

function luminance(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}

/** 在 (x, y) 处画一张边长 s 的宠物卡通画像 */
export function drawPortrait(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, pet: Pet) {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.rect(0, 0, s, s);
  ctx.clip();

  const [b0, b1] = BGS[pet.bg % BGS.length];
  const bg = ctx.createLinearGradient(0, 0, 0, s);
  bg.addColorStop(0, b0);
  bg.addColorStop(1, b1);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, s, s);

  const fur = pet.fur;
  const dark = shade(fur, 0.78);
  const light = shade(fur, 1.18);
  const isDark = luminance(fur) < 0.4;
  const circle = (cx: number, cy: number, r: number, fill: string) => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(cx * s, cy * s, r * s, 0, Math.PI * 2);
    ctx.fill();
  };
  const ellipse = (cx: number, cy: number, rx: number, ry: number, rot: number, fill: string) => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.ellipse(cx * s, cy * s, rx * s, ry * s, rot, 0, Math.PI * 2);
    ctx.fill();
  };
  const tri = (pts: number[], fill: string) => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(pts[0] * s, pts[1] * s);
    ctx.lineTo(pts[2] * s, pts[3] * s);
    ctx.lineTo(pts[4] * s, pts[5] * s);
    ctx.closePath();
    ctx.fill();
  };

  // 身体
  ellipse(0.5, 1.02, 0.3, 0.26, 0, dark);

  const hy = 0.56;
  switch (pet.species) {
    case '猫':
      tri([0.27, 0.46, 0.3, 0.2, 0.47, 0.36], fur);
      tri([0.73, 0.46, 0.7, 0.2, 0.53, 0.36], fur);
      tri([0.31, 0.41, 0.325, 0.27, 0.42, 0.36], '#f6b8b8');
      tri([0.69, 0.41, 0.675, 0.27, 0.58, 0.36], '#f6b8b8');
      circle(0.5, hy, 0.25, fur);
      break;
    case '狗':
      ellipse(0.25, 0.56, 0.075, 0.17, 0.25, dark);
      ellipse(0.75, 0.56, 0.075, 0.17, -0.25, dark);
      circle(0.5, hy, 0.25, fur);
      ellipse(0.5, 0.665, 0.115, 0.09, 0, isDark ? shade(fur, 1.6) : '#fffaf0');
      break;
    case '兔子':
      ellipse(0.41, 0.25, 0.05, 0.17, -0.12, fur);
      ellipse(0.59, 0.25, 0.05, 0.17, 0.12, fur);
      ellipse(0.41, 0.26, 0.024, 0.12, -0.12, '#f6b8b8');
      ellipse(0.59, 0.26, 0.024, 0.12, 0.12, '#f6b8b8');
      circle(0.5, hy, 0.24, fur);
      break;
    case '仓鼠':
      circle(0.31, 0.37, 0.065, dark);
      circle(0.69, 0.37, 0.065, dark);
      circle(0.31, 0.37, 0.035, '#f6b8b8');
      circle(0.69, 0.37, 0.035, '#f6b8b8');
      ellipse(0.5, hy, 0.29, 0.24, 0, fur);
      ellipse(0.36, 0.65, 0.1, 0.08, 0, light);
      ellipse(0.64, 0.65, 0.1, 0.08, 0, light);
      break;
    case '鸟':
      tri([0.46, 0.34, 0.5, 0.2, 0.56, 0.34], dark);
      circle(0.5, hy, 0.24, fur);
      ellipse(0.26, 0.74, 0.07, 0.13, 0.4, dark);
      ellipse(0.74, 0.74, 0.07, 0.13, -0.4, dark);
      break;
  }

  // 眼睛
  for (const ex of [0.41, 0.59]) {
    if (isDark) circle(ex, hy - 0.01, 0.044, '#f3e6b8');
    circle(ex, hy - 0.01, 0.033, '#2a2320');
    circle(ex + 0.011, hy - 0.022, 0.011, '#ffffff');
  }
  // 腮红
  ctx.globalAlpha = 0.45;
  circle(0.33, hy + 0.075, 0.035, pet.species === '鸟' ? '#ff9a4d' : '#ff9aa2');
  circle(0.67, hy + 0.075, 0.035, pet.species === '鸟' ? '#ff9a4d' : '#ff9aa2');
  ctx.globalAlpha = 1;

  // 鼻子与嘴
  if (pet.species === '鸟') {
    tri([0.465, 0.6, 0.535, 0.6, 0.5, 0.67], '#f39a2e');
  } else {
    const ny = pet.species === '狗' ? 0.625 : 0.63;
    if (pet.species === '狗') ellipse(0.5, ny, 0.034, 0.024, 0, '#2a2320');
    else tri([0.478, ny - 0.012, 0.522, ny - 0.012, 0.5, ny + 0.014], '#e88a94');
    ctx.strokeStyle = '#3a2f2a';
    ctx.lineWidth = Math.max(1, s * 0.008);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0.475 * s, (ny + 0.02) * s, 0.026 * s, 0.1, Math.PI * 0.9);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0.525 * s, (ny + 0.02) * s, 0.026 * s, 0.1, Math.PI * 0.9);
    ctx.stroke();
    if (pet.species === '猫') {
      ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.6)' : 'rgba(60,45,40,0.5)';
      for (const dir of [-1, 1]) {
        for (const dy of [-0.012, 0.02]) {
          ctx.beginPath();
          ctx.moveTo((0.5 + dir * 0.1) * s, (0.645 + dy * 0.3) * s);
          ctx.lineTo((0.5 + dir * 0.23) * s, (0.64 + dy) * s);
          ctx.stroke();
        }
      }
    }
  }

  // 轻微暗角
  const v = ctx.createRadialGradient(s / 2, s / 2, s * 0.35, s / 2, s / 2, s * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(60,30,20,0.22)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, s, s);
  ctx.restore();
}

/** 详情面板使用的大图 */
export function portraitDataURL(pet: Pet, size = 360) {
  const [c, ctx] = makeCanvas(size, size);
  drawPortrait(ctx, 0, 0, size, pet);
  return c.toDataURL('image/jpeg', 0.9);
}
