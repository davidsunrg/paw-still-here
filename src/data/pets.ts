import { CONFIG } from '../config';
import { STR } from '../i18n';

/** 物种的代号；显示名在语言文件里 */
export type Species = 'cat' | 'dog' | 'rabbit' | 'hamster' | 'bird';

/** 大厅照片墙的两个区：进门左手是 A，正对面是 B（右手那面墙是影厅和河的入口）。以后展区开放，字母往后接着排 */
export const SECTIONS = ['A', 'B'] as const;
export type Section = (typeof SECTIONS)[number];

export interface Pet {
  id: string;
  name: string;
  species: Species;
  breed?: string;
  birthDate?: string;
  passedDate: string;
  /** 真实照片地址；为空时使用程序生成的占位画像 */
  photoUrl?: string;
  /** 相册里另外的照片地址（不含上面那张）。打开它的小龛时挂在主相框两侧 */
  photos?: string[];
  /** 主人寄语 */
  message: string;
  flowers: number;
  candles: number;
  /** 地址：第几层、哪个区、第几格（层和格从 1 开始）。按入驻顺序分配，分配后不再变 */
  floor: number;
  section: Section;
  cell: number;
  /** 占位画像用的毛色与背景 */
  fur: string;
  bg: number;
}

/**
 * 在这里添加真实的宠物。它们会排在最前面，住进 A 区最靠前的格子。
 * 只需填写 name / species / passedDate / message，其余字段可省略。
 *
 * 例：
 * { name: 'Bean', species: 'dog', breed: 'Corgi', birthDate: '2012-03-01',
 *   passedDate: '2025-06-18', photoUrl: '/photos/bean.jpg', photos: ['/photos/bean-2.jpg', '/photos/bean-3.jpg'],
 *   message: 'Be my dog again next time.' }
 */
export const CUSTOM_PETS: Array<Partial<Pet> & Pick<Pet, 'name' | 'species' | 'passedDate' | 'message'>> = [];

const G = CONFIG.gallery;
/** 每个区各有多少格，顺序和 SECTIONS 一致 */
export const SECTION_CELLS = [G.sideCols * G.rows, G.backCols * 2 * G.rows];

/** 可复现的伪随机数 */
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

function buildPets(): Pet[] {
  const rnd = mulberry32(20261119);
  const pick = <T>(arr: T[]) => arr[Math.floor(rnd() * arr.length)];
  const capacity = SECTION_CELLS.reduce((a, b) => a + b, 0);
  const count = Math.min(CONFIG.petCount, capacity, 100);

  // 以前这里用随机数把宠物打散到各个柜子里；现在按入驻顺序排，但保留这些取值，
  // 这样每只示例宠物的名字、品种、日期都和原来一样（访客存在本地的礼物才对得上）
  for (let i = 0; i < 159; i++) rnd();

  const speciesTable: Species[] = ['cat', 'cat', 'cat', 'cat', 'cat', 'dog', 'dog', 'dog', 'dog', 'dog', 'rabbit', 'rabbit', 'hamster', 'bird'];
  // 名字、品种、寄语来自当前语言的示例内容
  const sample = STR.sample;
  const names = [...sample.names];
  const pets: Pet[] = [];

  for (let i = 0; i < count; i++) {
    const custom = CUSTOM_PETS[i];
    const species = custom?.species ?? pick(speciesTable);
    const year = 2016 + Math.floor(rnd() * 11);
    const month = 1 + Math.floor(rnd() * (year === 2026 ? 10 : 12));
    const day = 1 + Math.floor(rnd() * 28);
    const [lo, hi] = LIFESPAN[species];
    const age = lo + Math.floor(rnd() * (hi - lo + 1));
    const bMonth = 1 + Math.floor(rnd() * 12);
    const nameIdx = Math.floor(rnd() * names.length);
    const name = names.splice(nameIdx, 1)[0] ?? sample.fallbackName(i + 1);
    // 按入驻顺序依次填：A 区满了到 B 区
    let sec = 0;
    let cell = i;
    while (cell >= SECTION_CELLS[sec]) cell -= SECTION_CELLS[sec++];

    const base: Pet = {
      id: `pet-${i + 1}`,
      name,
      species,
      breed: pick(sample.breeds[species]),
      birthDate: `${year - age}-${pad(bMonth)}-${pad(1 + Math.floor(rnd() * 28))}`,
      passedDate: `${year}-${pad(month)}-${pad(day)}`,
      message: pick(sample.messages),
      flowers: rnd() < 0.7 ? 1 + Math.floor(rnd() * 40) : 0,
      candles: rnd() < 0.55 ? 1 + Math.floor(rnd() * 25) : 0,
      floor: 1,
      section: SECTIONS[sec],
      cell: cell + 1,
      fur: pick(FUR[species]),
      bg: Math.floor(rnd() * 6),
    };
    pets.push(custom ? { ...base, ...custom } : base);
  }
  return pets;
}

export const PETS: Pet[] = buildPets();

export const petById = new Map(PETS.map((p) => [p.id, p]));

/** 相册里的一张：有地址的是真实照片；variant 是照片还没加载出来（或没有照片）时用哪一种占位画像 */
export interface Shot {
  url?: string;
  variant: number;
}

/**
 * 一只宠物相册里除了主照片之外的几张，张数不限。
 * 填了 photos 的用它的真实照片；只有一张真实照片的没有相册；
 * 示例宠物用几张不同的占位画像，每只两到四张。
 */
export function albumOf(pet: Pet): Shot[] {
  const A = CONFIG.shrine.album;
  if (pet.photos?.length) return pet.photos.map((url, i) => ({ url, variant: 1 + (i % A.variants) }));
  if (pet.photoUrl) return [];
  const n = Number(pet.id.replace(/\D/g, '')) || 0;
  const [lo, hi] = A.sample;
  const count = Math.min(A.variants, lo + (n % (hi - lo + 1)));
  return Array.from({ length: count }, (_, i) => ({ variant: 1 + ((n + i) % A.variants) }));
}
