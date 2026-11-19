import { CONFIG } from '../config';

export type Species = '猫' | '狗' | '兔子' | '仓鼠' | '鸟';

export interface Pet {
  id: string;
  name: string;
  species: Species;
  breed?: string;
  birthDate?: string;
  passedDate: string;
  /** 真实照片地址；为空时使用程序生成的占位画像 */
  photoUrl?: string;
  /** 主人寄语 */
  message: string;
  flowers: number;
  candles: number;
  /** 柜子编号（A、B、C…） */
  cabinet: string;
  /** 柜子序号（从 0 开始） */
  cabinetIndex: number;
  /** 格子序号（从 0 开始，左上角起逐行排列） */
  slot: number;
  /** 占位画像用的毛色与背景 */
  fur: string;
  bg: number;
}

/**
 * 在这里添加真实的宠物。它们会排在最前面，优先出现在大厅照片墙上。
 * 只需填写 name / species / passedDate / message，其余字段可省略。
 *
 * 例：
 * { name: '豆豆', species: '狗', breed: '柯基', birthDate: '2012-03-01',
 *   passedDate: '2025-06-18', photoUrl: '/photos/doudou.jpg', message: '下辈子还做我的小狗。' }
 */
export const CUSTOM_PETS: Array<Partial<Pet> & Pick<Pet, 'name' | 'species' | 'passedDate' | 'message'>> = [];

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

const NAMES = [
  '豆豆', '旺财', '咪咪', '小白', '球球', '雪球', '可乐', '奶茶', '布丁', '年糕', '汤圆', '馒头',
  '花花', '橘子', '大黄', '小黑', '毛毛', '多多', '乐乐', '妞妞', '皮皮', '糯米', '芝麻', '团子',
  '元宝', '包子', '饺子', '麻薯', '栗子', '柚子', '桃子', '果冻', '奥利奥', '可可', '摩卡', '拿铁',
  '泡芙', '蛋挞', '薯条', '土豆', '南瓜', '板栗', '花生', '核桃', '糖糖', '蜜糖', '小满', '冬至',
  '初一', '十五', '福宝', '来福', '平安', '如意', '阿黄', '阿福', '小虎', '胖虎', '丸子', '雪糕',
  '棉花', '云朵', '星星', '月亮', '小七', '八宝', '九月', '米粒', '豆包', '麦芽', '小鱼', '泡泡',
  '点点', '斑斑', '灰灰', '墨墨', '金金', '银子', '菠萝', '芒果', '西瓜', '樱桃', '椰子', '柠檬',
  '小熊', '贝贝', '嘟嘟', '咕噜', '啾啾', '叽叽', '跳跳', '闪闪', '欢欢', '笑笑', '安安', '小乖',
  '大福', '小麦', '阿布', '糖豆',
];

const BREEDS: Record<Species, string[]> = {
  猫: ['橘猫', '英短', '布偶', '狸花猫', '暹罗', '美短', '三花猫'],
  狗: ['金毛', '柯基', '柴犬', '泰迪', '边牧', '拉布拉多', '中华田园犬', '萨摩耶'],
  兔子: ['垂耳兔', '侏儒兔', '安哥拉兔'],
  仓鼠: ['金丝熊', '三线仓鼠', '布丁仓鼠'],
  鸟: ['玄凤鹦鹉', '虎皮鹦鹉', '文鸟'],
};

const FUR: Record<Species, string[]> = {
  猫: ['#f0a04b', '#9a9aa2', '#f5f0e6', '#4a4442', '#c9a27a'],
  狗: ['#e0b070', '#f4ede0', '#8a5c3c', '#4a423e', '#d08c4a'],
  兔子: ['#fbfbf8', '#cfc6bd', '#b08a68'],
  仓鼠: ['#f1c98d', '#e9e2d6', '#c9a87f'],
  鸟: ['#ffd84d', '#8fd0f0', '#9be08f', '#f5f5f5'],
};

const LIFESPAN: Record<Species, [number, number]> = {
  猫: [8, 18],
  狗: [7, 16],
  兔子: [5, 10],
  仓鼠: [2, 3],
  鸟: [5, 12],
};

const MESSAGES = [
  '谢谢你陪我走过那么多个日夜，下辈子还要来我家。',
  '你走以后，家里安静了好多。我很想你。',
  '在那边要好好吃饭，不许挑食。',
  '你是我见过最乖的小朋友，永远都是。',
  '每次开门，还是会下意识找你。',
  '愿你在彩虹桥的那一边，有吃不完的零食，晒不完的太阳。',
  '遇见你，是我这辈子最幸运的事之一。',
  '你教会了我什么是无条件的爱。',
  '等我们再见面的时候，你一定要第一个跑过来。',
  '你最喜欢的小毯子我还留着。',
  '对不起，没能多陪陪你。谢谢你，从来没怪过我。',
  '今天路过你常去的草地，风很温柔，像你。',
  '你只是换了一种方式陪着我，对吧。',
  '晚安，我的小宝贝。',
  '家里的阳台还是你的位置，谁也不许占。',
  '你是家人，一直都是。',
];

const pad = (n: number) => String(n).padStart(2, '0');

function buildPets(): Pet[] {
  const rnd = mulberry32(20261119);
  const pick = <T>(arr: T[]) => arr[Math.floor(rnd() * arr.length)];
  const { cabinet } = CONFIG;
  const perCab = cabinet.rows * cabinet.cols;
  const totalSlots = cabinet.count * perCab;
  const count = Math.min(CONFIG.petCount, totalSlots, 100);

  // 打乱所有格子，让空格子自然地分散在各个柜子里
  const slots = Array.from({ length: totalSlots }, (_, i) => i);
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }

  const speciesTable: Species[] = ['猫', '猫', '猫', '猫', '猫', '狗', '狗', '狗', '狗', '狗', '兔子', '兔子', '仓鼠', '鸟'];
  const names = [...NAMES];
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
    const name = names.splice(nameIdx, 1)[0] ?? `小可爱${i}`;
    const s = slots[i];
    const cabinetIndex = Math.floor(s / perCab);

    const base: Pet = {
      id: `pet-${i + 1}`,
      name,
      species,
      breed: pick(BREEDS[species]),
      birthDate: `${year - age}-${pad(bMonth)}-${pad(1 + Math.floor(rnd() * 28))}`,
      passedDate: `${year}-${pad(month)}-${pad(day)}`,
      message: pick(MESSAGES),
      flowers: rnd() < 0.7 ? 1 + Math.floor(rnd() * 40) : 0,
      candles: rnd() < 0.55 ? 1 + Math.floor(rnd() * 25) : 0,
      cabinet: String.fromCharCode(65 + cabinetIndex),
      cabinetIndex,
      slot: s % perCab,
      fur: pick(FUR[species]),
      bg: Math.floor(rnd() * 6),
    };
    pets.push(custom ? { ...base, ...custom } : base);
  }
  return pets;
}

export const PETS: Pet[] = buildPets();

export const petById = new Map(PETS.map((p) => [p.id, p]));
