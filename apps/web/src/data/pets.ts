import { CONFIG } from '../config';
import { GALLERY_CAPACITY, slotToPlacement } from '@paw/shared';
import { STR } from '../i18n';

/** 物种的代号；显示名在语言文件里 */
export type Species = 'cat' | 'dog' | 'rabbit' | 'hamster' | 'bird';

export const SECTIONS = ['A', 'B'] as const;
export type Section = (typeof SECTIONS)[number];

export interface Pet {
  id: string;
  name: string;
  species: Species;
  breed?: string;
  birthDate?: string;
  passedDate?: string;
  photoUrl?: string;
  /** 主图上传 ID，编辑时用于保留或替换 */
  mainUploadId?: string;
  photos?: string[];
  /** 有序相册的上传 ID 与公开地址 */
  photoUploads?: Array<{ uploadId: string; url: string }>;
  message?: string;
  flowers: number;
  candles: number;
  floor: number;
  section: Section;
  cell: number;
  fur: string;
  bg: number;
  /** 来自 API 的真实纪念宠物 */
  isReal?: boolean;
  /** 当前匿名用户可否编辑/删除 */
  canManage?: boolean;
}

const G = CONFIG.gallery;
export const SECTION_CELLS = [G.sideCols * G.rows, G.backCols * 2 * G.rows];

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FUR: Record<Species, string[]> = {
  cat: ['#f0a04b', '#9a9aa2', '#f5f0e6', '#4a4442', '#c9a27a'],
  dog: ['#e0b070', '#f4ede0', '#8a5c3c', '#4a423e', '#d08c4a'],
  rabbit: ['#fbfbf8', '#cfc6bd', '#b08a68'],
  hamster: ['#f1c98d', '#e9e2d6', '#c9a87f'],
  bird: ['#ffd84d', '#8fd0f0', '#9be08f', '#f5f5f5'],
};

const LIFESPAN: Record<Species, [number, number]> = {
  cat: [8, 18],
  dog: [7, 16],
  rabbit: [5, 10],
  hamster: [2, 3],
  bird: [5, 12],
};

const pad = (n: number) => String(n).padStart(2, '0');

const speciesTable: Species[] = [
  'cat',
  'cat',
  'cat',
  'cat',
  'cat',
  'dog',
  'dog',
  'dog',
  'dog',
  'dog',
  'rabbit',
  'rabbit',
  'hamster',
  'bird',
];

/** 某 slot 的确定性示例宠物（API 未占用的格子） */
export function buildSamplePetAtSlot(slot: number): Pet {
  const rnd = mulberry32(20261119 + slot * 991);
  const pick = <T>(arr: T[]) => arr[Math.floor(rnd() * arr.length)]!;
  const sample = STR.sample;
  const names = [...sample.names];
  const species = pick(speciesTable);
  const year = 2016 + Math.floor(rnd() * 11);
  const month = 1 + Math.floor(rnd() * (year === 2026 ? 10 : 12));
  const day = 1 + Math.floor(rnd() * 28);
  const [lo, hi] = LIFESPAN[species];
  const age = lo + Math.floor(rnd() * (hi - lo + 1));
  const bMonth = 1 + Math.floor(rnd() * 12);
  const name = names[slot % names.length] ?? sample.fallbackName(slot + 1);
  const { section, cell, floor } = slotToPlacement(slot);
  return {
    id: `pet-sample-${slot + 1}`,
    name,
    species,
    breed: pick(sample.breeds[species]),
    birthDate: `${year - age}-${pad(bMonth)}-${pad(1 + Math.floor(rnd() * 28))}`,
    passedDate: `${year}-${pad(month)}-${pad(day)}`,
    message: pick(sample.messages),
    flowers: rnd() < 0.7 ? 1 + Math.floor(rnd() * 40) : 0,
    candles: rnd() < 0.55 ? 1 + Math.floor(rnd() * 25) : 0,
    floor,
    section: section as Section,
    cell,
    fur: pick(FUR[species]),
    bg: Math.floor(rnd() * 6),
  };
}

/** API 不可用时的旧版示例集（数量由 CONFIG.petCount 决定） */
export function buildOfflineGallery(): Pet[] {
  const count = Math.min(CONFIG.petCount, GALLERY_CAPACITY);
  return Array.from({ length: count }, (_, i) => buildSamplePetAtSlot(i));
}

export const PETS: Pet[] = buildOfflineGallery();

export const petById = new Map(PETS.map((p) => [p.id, p]));

export function replacePets(next: Pet[]): void {
  PETS.length = 0;
  PETS.push(...next);
  petById.clear();
  for (const p of next) petById.set(p.id, p);
}

/** 把某一格换成刚创建/编辑好的宠物；返回原来那一格的宠物 */
export function replaceSlotPet(slot: number, pet: Pet): Pet | undefined {
  const old = PETS[slot];
  if (!old) return undefined;
  PETS[slot] = pet;
  petById.delete(old.id);
  petById.set(pet.id, pet);
  return old;
}

export function albumOf(pet: Pet): Shot[] {
  const A = CONFIG.shrine.album;
  if (pet.photos?.length) return pet.photos.map((url, i) => ({ url, variant: 1 + (i % A.variants) }));
  if (pet.photoUrl) return [];
  const n = Number(pet.id.replace(/\D/g, '')) || 0;
  const [lo, hi] = A.sample;
  const count = Math.min(A.variants, lo + (n % (hi - lo + 1)));
  return Array.from({ length: count }, (_, i) => ({ variant: 1 + ((n + i) % A.variants) }));
}

export interface Shot {
  url?: string;
  variant: number;
}