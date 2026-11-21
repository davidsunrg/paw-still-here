import { STR } from '../i18n';
import { petById, type Pet } from './pets';
import { tributes } from './tributes';

/**
 * 数据层。真实宠物（isReal）收到的礼物和信保存在服务器上，这里转给 tributes；
 * 示例宠物的礼物和信、写给所有小家伙的信、对信的爱心 / 回的话 / 举报、孔明灯、室外仪式保存在 localStorage。
 */

/** 可以放进格子的礼物种类 */
export type GiftKind = 'flower' | 'candle' | 'snack' | 'toy';
/** 礼物 + 信 */
export type OfferKind = GiftKind | 'letter';

export const GIFT_KINDS: GiftKind[] = ['flower', 'candle', 'snack', 'toy'];

/** 每种礼物有几种外观（花色、蜡烛高矮、罐头 / 小鱼干 / 骨头、球 / 毛线团） */
export const GIFT_VARIANTS: Record<GiftKind, number> = { flower: 5, candle: 3, snack: 3, toy: 2 };

export interface Gift {
  kind: GiftKind;
  /** 外观序号 */
  v: number;
  time: number;
}

export interface Message {
  text: string;
  time: number;
  petId?: string;
}

interface PetRecord {
  gifts: Gift[];
  letters: Message[];
}

/** 室外的纪念仪式：河灯、篝火烧信。只记录为谁做过、什么时候做的 */
export type RiteKind = 'river' | 'fire';
interface Rite {
  petId: string;
  time: number;
}

/**
 * 访客对信做过的事：送过爱心的、举报后不再显示的、回的话。
 * 用信的编号记（见 letterId），信本身的存法不变。
 */
interface Social {
  hearts: string[];
  hidden: string[];
  replies: Record<string, Message[]>;
}

interface State {
  pets: Record<string, PetRecord>;
  guestbook: Message[];
  lanterns: number;
  rites: Record<RiteKind, Rite[]>;
  social: Social;
}

/** 列表里的一封信：自己写的和示例的都是这个样子 */
export interface Letter extends Message {
  id: string;
  petName?: string;
  /** 是不是这位访客自己写的 */
  mine: boolean;
  hearts: number;
  hearted: boolean;
  replies: Message[];
  /** 保存在服务器上的信：它在服务器上的编号（还没存好的没有） */
  remoteId?: string;
  /** 这位访客可以把它拿掉（自己写的，或者是自己宠物收到的） */
  removable?: boolean;
}

/** 每封信最多留多少条回的话 */
const REPLY_CAP = 50;

function social(raw: unknown): Social {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const ids = (list: unknown) => (Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : []);
  const replies: Record<string, Message[]> = {};
  if (s.replies && typeof s.replies === 'object') {
    for (const [id, list] of Object.entries(s.replies as Record<string, unknown>)) {
      const items = messages(list).slice(-REPLY_CAP);
      if (items.length) replies[id] = items;
    }
  }
  return { hearts: ids(s.hearts), hidden: ids(s.hidden), replies };
}

function rites(list: unknown): Rite[] {
  if (!Array.isArray(list)) return [];
  return list
    .filter((r): r is Rite => !!r && typeof (r as Rite).petId === 'string')
    .map((r) => ({ petId: r.petId, time: Number(r.time) || 0 }));
}

const KEY = 'jinian:v2';
/** 旧版本的键名：每只宠物只记了 花数 / 蜡烛数 / 留言 */
const KEY_V1 = 'jinian:v1';
/** 读取旧数据时单只宠物最多转换的礼物数，防止异常数据撑爆存储 */
const MIGRATE_CAP = 500;

function isMessage(m: unknown): m is Message {
  return !!m && typeof (m as Message).text === 'string';
}

function messages(list: unknown, petId?: string): Message[] {
  if (!Array.isArray(list)) return [];
  return list.filter(isMessage).map((m) => ({ text: m.text, time: Number(m.time) || 0, ...(petId ? { petId } : {}) }));
}

function count(n: unknown) {
  return Math.max(0, Math.min(MIGRATE_CAP, Math.floor(Number(n) || 0)));
}

/** 旧格式 → 新格式：花数和蜡烛数展开成礼物列表，留言变成信 */
function migrateV1(old: Record<string, unknown>): State {
  const pets: Record<string, PetRecord> = {};
  const oldPets = (old.pets && typeof old.pets === 'object' ? old.pets : {}) as Record<string, Record<string, unknown>>;
  for (const [id, r] of Object.entries(oldPets)) {
    if (!r || typeof r !== 'object') continue;
    const gifts: Gift[] = [];
    for (let i = 0; i < count(r.flowers); i++) gifts.push({ kind: 'flower', v: i % GIFT_VARIANTS.flower, time: 0 });
    for (let i = 0; i < count(r.candles); i++) gifts.push({ kind: 'candle', v: i % GIFT_VARIANTS.candle, time: 0 });
    pets[id] = { gifts, letters: messages(r.comments, id) };
  }
  return { pets, guestbook: messages(old.guestbook), lanterns: count(old.lanterns), rites: { river: [], fire: [] }, social: social(null) };
}

function normalize(s: Record<string, unknown>): State {
  const pets: Record<string, PetRecord> = {};
  const raw = (s.pets && typeof s.pets === 'object' ? s.pets : {}) as Record<string, Record<string, unknown>>;
  for (const [id, r] of Object.entries(raw)) {
    if (!r || typeof r !== 'object') continue;
    const gifts = (Array.isArray(r.gifts) ? r.gifts : [])
      .filter((g): g is Gift => !!g && GIFT_KINDS.includes((g as Gift).kind))
      .map((g) => ({ kind: g.kind, v: Math.abs(Math.floor(Number(g.v) || 0)), time: Number(g.time) || 0 }));
    pets[id] = { gifts, letters: messages(r.letters, id) };
  }
  const r = (s.rites && typeof s.rites === 'object' ? s.rites : {}) as Record<string, unknown>;
  return {
    pets,
    guestbook: messages(s.guestbook),
    lanterns: Math.max(0, Math.floor(Number(s.lanterns) || 0)),
    rites: { river: rites(r.river), fire: rites(r.fire) },
    social: social(s.social),
  };
}

function load(): State {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return normalize(JSON.parse(raw));
    const old = localStorage.getItem(KEY_V1);
    if (old) {
      const state = migrateV1(JSON.parse(old));
      // 旧数据原样保留，只是另存一份新格式
      localStorage.setItem(KEY, JSON.stringify(state));
      return state;
    }
  } catch {
    // 数据损坏或无法访问 localStorage 时，从空状态开始
  }
  return { pets: {}, guestbook: [], lanterns: 0, rites: { river: [], fire: [] }, social: social(null) };
}

const state = load();

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // 隐私模式等情况下写入失败，忽略即可
  }
}

function record(id: string): PetRecord {
  return (state.pets[id] ??= { gifts: [], letters: [] });
}

function seed(pet: Pet) {
  return Number(pet.id.replace(/\D/g, '')) || 0;
}

/** 示例宠物自带的礼物数量，让格子不显得空 */
function presetCounts(pet: Pet): Record<GiftKind, number> {
  const n = seed(pet);
  return { flower: pet.flowers, candle: pet.candles, snack: (n * 7) % 4, toy: (n * 5) % 3 };
}

function presetLetters(pet: Pet): Message[] {
  const n = seed(pet);
  if (n % 3 !== 0) return [];
  const pool = STR.sample.letters;
  // n 是 3 的倍数，先除以 3 再挑：不然只会挑到其中的两三句
  return Array.from({ length: 1 + (n % 2) }, (_, i) => ({ text: pool[(n / 3 + i * 5) % pool.length], time: 0 }));
}

/** 示例的信自带几颗爱心：按编号算出来的固定数字 */
function presetHearts(id: string) {
  let h = 7;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 9973;
  return 1 + (h % 14);
}

function letter(id: string, m: Message, mine: boolean, sample = !mine): Letter {
  const s = state.social;
  const hearted = s.hearts.includes(id);
  return {
    ...m,
    id,
    petName: m.petId ? petById.get(m.petId)?.name : undefined,
    mine,
    hearted,
    hearts: (sample ? presetHearts(id) : 0) + (hearted ? 1 : 0),
    replies: s.replies[id] ?? [],
  };
}

/** 服务器上的一封信 → 列表里的样子 */
function remoteLetter(petId: string, l: { id: string; text: string; createdAt: number; mine: boolean }): Letter {
  const saved = !tributes.isDraft(l.id);
  return {
    ...letter(`r:${l.id}`, { text: l.text, time: l.createdAt, petId }, l.mine, false),
    ...(saved ? { remoteId: l.id, removable: l.mine || petById.get(petId)?.canManage === true } : {}),
  };
}

export const store = {
  /** 每种礼物和信的总数（示例基数 + 访客新增） */
  counts(pet: Pet): Record<OfferKind, number> {
    if (pet.isReal) return tributes.counts(pet.id);
    const c: Record<OfferKind, number> = { ...presetCounts(pet), letter: presetLetters(pet).length };
    const r = state.pets[pet.id];
    if (r) {
      for (const g of r.gifts) c[g.kind]++;
      c.letter += r.letters.length;
    }
    return c;
  },
  /** 每种礼物按放入顺序排列的外观序号，用来在格子里摆出实物 */
  gifts(pet: Pet): Record<GiftKind, number[]> {
    if (pet.isReal) return tributes.gifts(pet.id);
    const n = seed(pet);
    const preset = presetCounts(pet);
    const out = {} as Record<GiftKind, number[]>;
    for (const kind of GIFT_KINDS) {
      out[kind] = Array.from({ length: preset[kind] }, (_, i) => (n + i) % GIFT_VARIANTS[kind]);
    }
    for (const g of state.pets[pet.id]?.gifts ?? []) out[g.kind].push(g.v % GIFT_VARIANTS[g.kind]);
    return out;
  },
  /** 这位访客今天是不是已经给它放过这种礼物（只有真实宠物一天一次） */
  givenToday(pet: Pet, kind: GiftKind) {
    return pet.isReal === true && tributes.givenToday(pet.id, kind);
  },
  /**
   * 放一件礼物。数量马上就变；返回的 Promise 在存好之后完成。
   * 真实宠物的要等服务器：没收下时这一件已经拿掉，Promise 以那个错误结束。
   */
  addGift(pet: Pet, kind: GiftKind): Promise<void> {
    if (pet.isReal) return tributes.give(pet.id, kind).saved;
    record(pet.id).gifts.push({ kind, v: Math.floor(Math.random() * GIFT_VARIANTS[kind]), time: Date.now() });
    save();
    return Promise.resolve();
  },
  /** 写一封信，和 addGift 一样先记上、再等服务器 */
  addLetter(pet: Pet, text: string): Promise<void> {
    if (pet.isReal) return tributes.write(pet.id, text).saved;
    record(pet.id).letters.push({ text, time: Date.now(), petId: pet.id });
    save();
    return Promise.resolve();
  },
  /** 拿掉一封保存在服务器上的信 */
  removeLetter(l: Letter): Promise<void> {
    if (!l.petId || !l.remoteId) return Promise.reject(new Error('not_removable'));
    return tributes.removeLetter(l.petId, l.remoteId);
  },
  addGuestbook(text: string) {
    state.guestbook.push({ text, time: Date.now() });
    save();
  },
  /**
   * 挂在纪念树上的信：写给各只宠物的，加上写给这里所有小家伙的（原来的留言簿）。
   * 自己写的排在前面（新的在前），后面是示例的；举报过的不再出现。传了 pet 就只看写给它的。
   */
  feed(pet?: Pet, limit = 80): Letter[] {
    const hiddenIds = new Set(state.social.hidden);
    // 真实宠物的信都在服务器上，服务器给的已经是新的在前
    if (pet?.isReal) {
      return tributes
        .letters(pet.id)
        .map((l) => remoteLetter(pet.id, l))
        .filter((l) => !hiddenIds.has(l.id))
        .slice(0, limit);
    }
    const own: Letter[] = [];
    const preset: Letter[] = [];
    // 看全部的时候，自己写给真实宠物的也算进来（读到过的那些）
    if (!pet) for (const l of tributes.mine()) own.push(remoteLetter(l.petId, l));
    if (!pet) for (const m of state.guestbook) own.push(letter(`g:${m.time}`, m, true));
    for (const [id, r] of Object.entries(state.pets)) {
      if (pet && id !== pet.id) continue;
      for (const m of r.letters) own.push(letter(`p:${id}:${m.time}`, { ...m, petId: id }, true));
    }
    own.sort((a, b) => b.time - a.time);
    if (!pet) STR.sample.guestbook.forEach((text, i) => preset.push(letter(`sg:${i}`, { text, time: 0 }, false)));
    for (const p of pet ? [pet] : petById.values()) {
      presetLetters(p).forEach((m, i) => preset.push(letter(`sp:${p.id}:${i}`, { ...m, petId: p.id }, false)));
    }
    const hidden = hiddenIds;
    const shown = (l: Letter) => !hidden.has(l.id);
    if (pet) return [...own, ...preset].filter(shown).slice(0, limit);
    // 看全部的时候：示例的信按编号打散，不让同一只宠物的排在一起；
    // 示例宠物的信是从几句话里挑的，同一句话只留一封，列表里不出现一模一样的
    preset.sort((a, b) => presetHearts(`o${a.id}`) - presetHearts(`o${b.id}`));
    const texts = new Set<string>();
    // 先去重再去掉举报过的：不然举报了一封，另一只宠物那封一模一样的又补上来
    const unique = preset.filter((l) => !texts.has(l.text) && texts.add(l.text)).filter(shown);
    return [...own.filter(shown), ...unique].slice(0, limit);
  },
  /** 这位访客自己写过多少封（纪念树上有几块是自己的木牌） */
  ownLetters() {
    return state.guestbook.length + Object.values(state.pets).reduce((n, r) => n + r.letters.length, 0) + tributes.mine().length;
  },
  /** 给一封信送一颗爱心，再点一次收回；返回现在是不是送着 */
  toggleHeart(id: string) {
    const { hearts } = state.social;
    const i = hearts.indexOf(id);
    if (i >= 0) hearts.splice(i, 1);
    else hearts.push(id);
    save();
    return i < 0;
  },
  addReply(id: string, text: string) {
    const list = (state.social.replies[id] ??= []);
    list.push({ text, time: Date.now() });
    if (list.length > REPLY_CAP) list.shift();
    save();
  },
  /** 举报一封信：没有后端，只是在这位访客这里不再显示 */
  report(id: string) {
    if (!state.social.hidden.includes(id)) state.social.hidden.push(id);
    save();
  },
  /** 记下做过一次室外仪式（放河灯 / 烧信）。河灯可以不写给某一只，这时 petId 记空字符串 */
  addRite(kind: RiteKind, pet: Pet | null) {
    state.rites[kind].push({ petId: pet?.id ?? '', time: Date.now() });
    save();
  },
  riteCount(kind: RiteKind, pet: Pet) {
    return state.rites[kind].filter((r) => r.petId === pet.id).length;
  },
  addLantern() {
    state.lanterns++;
    save();
    return state.lanterns;
  },
};

/** 界面偏好和这台浏览器记着的小事（不属于纪念数据，单独存一个键） */
const PREF_KEY = 'jinian:prefs';

interface Prefs {
  solo?: boolean;
  inviteSeen?: boolean;
  /** 上一次看自己宠物的纪念角是什么时候（毫秒） */
  seen?: Record<string, number>;
}

function readPrefs(): Prefs {
  try {
    const raw = JSON.parse(localStorage.getItem(PREF_KEY) ?? '{}');
    return raw && typeof raw === 'object' ? (raw as Prefs) : {};
  } catch {
    return {};
  }
}

/** 只改其中几项，别的原样留着 */
function writePrefs(patch: Prefs) {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify({ ...readPrefs(), ...patch }));
  } catch {
    // 无法访问 localStorage 时只在本次参观里生效
  }
}

export const prefs = {
  /** 是否「独自参观」：隐藏其他访客 */
  get solo(): boolean {
    return readPrefs().solo === true;
  },
  set solo(on: boolean) {
    writePrefs({ solo: on });
  },
  /** 「给你的宠物留个位置」的小卡片是不是已经出现过 */
  get inviteSeen(): boolean {
    return readPrefs().inviteSeen === true;
  },
  set inviteSeen(on: boolean) {
    writePrefs({ inviteSeen: on });
  },
  /** 上一次看这只（自己的）宠物是什么时候；没看过是 undefined */
  lastSeen(petId: string): number | undefined {
    const t = readPrefs().seen?.[petId];
    return typeof t === 'number' && Number.isFinite(t) ? t : undefined;
  },
  markSeen(petId: string, time = Date.now()) {
    writePrefs({ seen: { ...readPrefs().seen, [petId]: time } });
  },
};
