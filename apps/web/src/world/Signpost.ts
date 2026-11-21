import { CONFIG } from '../config';
import { textMesh } from './textures';
import type { World } from './World';

/**
 * 小木头路牌：一根木桩，上面一块深色木板，板上两三个词的名字。
 * 只告诉人「这里有件事可以做」，来历写在点开后的弹窗里。
 * ry 是牌面朝向（0 朝 +Z，也就是朝着从石头路走过来的人）；点牌子和点旁边的东西是一回事。
 */
export function signpost(w: World, x: number, z: number, ry: number, text: string, tip: string, onClick: () => void) {
  const { kit } = w;
  const S = CONFIG.signpost;
  const C = CONFIG.colors;
  const nx = Math.sin(ry);
  const nz = Math.cos(ry);
  const y = S.h - S.boardH / 2;
  kit.cyl(x, 0, z, 0.04, S.h + 0.05, C.woodDark);
  // 木板钉在木桩朝前的一面，字贴在木板表面
  const off = 0.04 + S.t / 2;
  kit.box(x + nx * off, y, z + nz * off, S.w, S.boardH, S.t, 0x5a4636, ry);
  const label = textMesh(text, { height: S.text, color: '#ffd9a0', glow: 1.25, maxWidth: S.w - 0.1 });
  label.position.set(x + nx * (off + S.t / 2 + 0.004), y, z + nz * (off + S.t / 2 + 0.004));
  label.rotation.y = ry;
  w.scene.add(label);
  w.collide(x, z, 0.3, 0.3);
  w.proxy(x + nx * off, y, z + nz * off, S.w, S.boardH + 0.1, S.w, tip, onClick);
}
