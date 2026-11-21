/** 每层的位置数（A 60 + B 66 + C–H 6×36），以及最多几层 */
export const FLOOR_CAPACITY = 342 as const;
export const MAX_FLOORS = 6 as const;
export const GALLERY_CAPACITY = FLOOR_CAPACITY * MAX_FLOORS;

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

/** 大厅每层每区格数：A/B 是原有围墙，C–H 是后门展区的三排双面墙 */
export const SECTION_CELLS = [60, 66, 36, 36, 36, 36, 36, 36] as const;
export const SECTIONS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;
export type GallerySection = (typeof SECTIONS)[number];

export function slotToPlacement(slot: number): {
  floor: number;
  section: GallerySection;
  cell: number;
} {
  const floor = Math.min(MAX_FLOORS, Math.floor(slot / FLOOR_CAPACITY) + 1);
  let remaining = slot - (floor - 1) * FLOOR_CAPACITY;
  if (remaining < 0 || remaining >= FLOOR_CAPACITY) remaining = 0;
  let sec = 0;
  while (sec < SECTION_CELLS.length && remaining >= SECTION_CELLS[sec]!) {
    remaining -= SECTION_CELLS[sec]!;
    sec++;
  }
  return { floor, section: SECTIONS[sec] ?? 'A', cell: remaining + 1 };
}

export function placementToSlot(floor: number, section: GallerySection, cell: number): number | null {
  const floorIdx = Math.floor(floor) - 1;
  if (floorIdx < 0 || floorIdx >= MAX_FLOORS) return null;
  const secIdx = SECTIONS.indexOf(section);
  if (secIdx < 0) return null;
  const local = SECTION_CELLS.slice(0, secIdx).reduce((a, b) => a + b, 0) + (cell - 1);
  if (local < 0 || local >= FLOOR_CAPACITY) return null;
  return floorIdx * FLOOR_CAPACITY + local;
}