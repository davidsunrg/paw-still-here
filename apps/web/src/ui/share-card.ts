import type { Pet } from '../data/pets';
import { STR } from '../i18n';
import { portraitDataURL } from '../world/textures';

/** 分享用的图片：竖版，上面一块方的是它的纪念角，下面是名字、日期和来这里的地址 */
const W = 1080;
const H = 1350;
/** 画面占上面多高；再往下是字 */
const SCENE_H = 1080;

function loadImage(url: string, cors: boolean) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    if (cors) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image_failed'));
    img.src = url;
  });
}

/** 把一张图铺满指定的区域（多出来的裁掉），focusY 是竖直方向保留哪一段 */
function cover(ctx: CanvasRenderingContext2D, src: CanvasImageSource, sw: number, sh: number, x: number, y: number, w: number, h: number, focusY = 0.5) {
  const scale = Math.max(w / sw, h / sh);
  const cw = w / scale;
  const ch = h / scale;
  ctx.drawImage(src, (sw - cw) / 2, (sh - ch) * focusY, cw, ch, x, y, w, h);
}

/** 字太长就缩小，直到放得下 */
function fitText(ctx: CanvasRenderingContext2D, text: string, font: (px: number) => string, px: number, maxWidth: number) {
  ctx.font = font(px);
  while (px > 28 && ctx.measureText(text).width > maxWidth) ctx.font = font((px -= 4));
}

function toBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('blob_failed'))), 'image/png');
  });
}

/**
 * 画一张分享图。scene 是刚渲染完的 3D 画面（要在同一刻画下来，所以由调用的地方先渲染再传进来）；
 * 没有或者画不了，就用它的照片（照片也用不了时，用占位画像）。
 */
export async function makeShareCard(pet: Pet, scene: HTMLCanvasElement | null, host: string): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no_canvas');

  ctx.fillStyle = '#16120f';
  ctx.fillRect(0, 0, W, H);

  let drawn = false;
  if (scene && scene.width > 0 && scene.height > 0) {
    try {
      cover(ctx, scene, scene.width, scene.height, 0, 0, W, SCENE_H, 0.5);
      drawn = true;
    } catch {
      drawn = false;
    }
  }
  if (!drawn) {
    // 照片在别的域名上，那边不允许跨域读取时画上去会导不出图：这时退回占位画像
    let img: HTMLImageElement | null = null;
    if (pet.photoUrl) img = await loadImage(pet.photoUrl, true).catch(() => null);
    img ??= await loadImage(portraitDataURL(pet, 900), false);
    cover(ctx, img, img.naturalWidth, img.naturalHeight, 0, 0, W, SCENE_H, 0.3);
  }

  // 画面的下沿慢慢暗进下面的底色里，不是一刀切开
  const shade = ctx.createLinearGradient(0, SCENE_H - 260, 0, SCENE_H);
  shade.addColorStop(0, 'rgba(22, 18, 15, 0)');
  shade.addColorStop(1, 'rgba(22, 18, 15, 1)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, SCENE_H - 260, W, 262);

  // 名字用页面上标题的那种字体
  const root = getComputedStyle(document.documentElement);
  const family = root.getPropertyValue('--serif').trim() || getComputedStyle(document.body).fontFamily || 'serif';
  const pad = 84;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#fff4e2';
  fitText(ctx, pet.name, (px) => `600 ${px}px ${family}`, 100, W - pad * 2);
  ctx.fillText(pet.name, pad, H - 228);

  ctx.fillStyle = 'rgba(255, 244, 226, 0.78)';
  ctx.font = `400 36px ${family}`;
  // 只写知道的日期，不写问号
  const dates = [pet.birthDate, pet.passedDate].filter(Boolean).join(' — ');
  const line = [pet.breed ?? STR.species[pet.species], dates].filter(Boolean).join(' · ');
  ctx.fillText(line, pad, H - 166);

  // 一条细线，下面是来这里的地址
  ctx.fillStyle = 'rgba(255, 214, 150, 0.55)';
  ctx.fillRect(pad, H - 128, 120, 3);
  ctx.fillStyle = 'rgba(255, 226, 180, 0.92)';
  fitText(ctx, `${STR.shareCardVisit(pet.name)} ${host}`, (px) => `400 ${px}px ${family}`, 34, W - pad * 2);
  ctx.fillText(`${STR.shareCardVisit(pet.name)} ${host}`, pad, H - 70);

  try {
    return await toBlob(canvas);
  } catch (error) {
    // 画进去的东西不让导出（跨域的照片）：只用占位画像再画一次
    if (scene || pet.photoUrl) return makeShareCard({ ...pet, photoUrl: undefined }, null, host);
    throw error;
  }
}
