export const GALLERY_CAPACITY = 100 as const;

export const SPECIES = ['cat', 'dog', 'rabbit', 'hamster', 'bird'] as const;
export type Species = (typeof SPECIES)[number];

export const UPLOAD_STATUS = ['pending', 'completed'] as const;
export type UploadStatus = (typeof UPLOAD_STATUS)[number];

export const PHOTO_ROLE = ['main', 'gallery'] as const;
export type PhotoRole = (typeof PHOTO_ROLE)[number];

/** 访客可以留在纪念角里的礼物；每种有几种外观 */
export const TRIBUTE_KINDS = ['flower', 'candle', 'snack', 'toy'] as const;
export type TributeKind = (typeof TRIBUTE_KINDS)[number];
export const TRIBUTE_VARIANTS: Record<TributeKind, number> = { flower: 5, candle: 3, snack: 3, toy: 2 };
/** 一封信最长多少字；同一个人一天最多给同一只宠物写几封 */
export const LETTER_MAX = 300;
export const LETTERS_PER_DAY = 5;

/** 大厅 A/B 区每区格数，与前端 CONFIG 一致 */
export const SECTION_CELLS = [60, 40] as const;
export const SECTIONS = ['A', 'B'] as const;
export type GallerySection = (typeof SECTIONS)[number];

export function slotToPlacement(slot: number): {
  floor: number;
  section: GallerySection;
  cell: number;
} {
  let remaining = slot;
  let sec = 0;
  while (sec < SECTION_CELLS.length && remaining >= SECTION_CELLS[sec]!) {
    remaining -= SECTION_CELLS[sec]!;
    sec++;
  }
  return { floor: 1, section: SECTIONS[sec] ?? 'A', cell: remaining + 1 };
}

export function placementToSlot(section: GallerySection, cell: number): number | null {
  const secIdx = SECTIONS.indexOf(section);
  if (secIdx < 0) return null;
  const base = SECTION_CELLS.slice(0, secIdx).reduce((a, b) => a + b, 0);
  const slot = base + (cell - 1);
  return slot >= 0 && slot < GALLERY_CAPACITY ? slot : null;
}