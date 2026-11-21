import {
  TRIBUTE_KINDS,
  TRIBUTE_VARIANTS,
  type LetterDto,
  type PetDto,
  type PetTributesDto,
  type TributeCounts,
  type TributeDto,
  type TributeKind,
} from '@paw/shared';
import { ApiError, apiFetch } from '../api/client';

/**
 * 真实宠物收到的礼物和信：保存在服务器上，这里是它们在浏览器里的一份。
 * 照片墙读进来时先有数量；走进纪念角时再读每件礼物的外观和信。
 * 放礼物、写信先改这一份（画面马上有反应），服务器没收下再改回去。
 */

interface Entry {
  counts: TributeCounts;
  /** 每种礼物按放入先后排列的外观；没读过详情时是空的 */
  gifts: Record<TributeKind, number[]>;
  letters: LetterDto[];
  detailed: boolean;
}

const cache = new Map<string, Entry>();

/** 今天（UTC，和服务器算「一天一次」用的是同一天）已经给谁放过哪种礼物：不用等服务器拒绝就知道 */
const GIVEN_KEY = 'jinian:given';
function today() {
  return new Date().toISOString().slice(0, 10);
}
function readGiven(): { day: string; keys: string[] } {
  try {
    const raw = JSON.parse(localStorage.getItem(GIVEN_KEY) ?? '{}') as { day?: unknown; keys?: unknown };
    if (raw.day === today() && Array.isArray(raw.keys)) return { day: raw.day, keys: raw.keys.filter((k): k is string => typeof k === 'string') };
  } catch {
    // 读不了就当今天还没放过，由服务器把关
  }
  return { day: today(), keys: [] };
}
function markGiven(petId: string, kind: TributeKind) {
  const given = readGiven();
  const key = `${petId}:${kind}`;
  if (!given.keys.includes(key)) given.keys.push(key);
  try {
    localStorage.setItem(GIVEN_KEY, JSON.stringify(given));
  } catch {
    // 存不了也没关系
  }
}

function zero(): TributeCounts {
  return { flower: 0, candle: 0, snack: 0, toy: 0, letter: 0 };
}

function entry(petId: string): Entry {
  let e = cache.get(petId);
  if (!e) cache.set(petId, (e = { counts: zero(), gifts: { flower: [], candle: [], snack: [], toy: [] }, letters: [], detailed: false }));
  return e;
}

export const tributes = {
  /** 照片墙读进来之后：记下每只宠物的数量 */
  seed(dtos: PetDto[]) {
    for (const dto of dtos) entry(dto.id).counts = { ...dto.tributes };
  },

  counts(petId: string): TributeCounts {
    return { ...entry(petId).counts };
  },

  /**
   * 每种礼物摆出来的外观。读过详情的用真的；
   * 没读过的、或者数量比带回来的多的，前面用按序号排的外观补齐，摆出来的件数和数量对得上。
   */
  gifts(petId: string): Record<TributeKind, number[]> {
    const e = entry(petId);
    const out = {} as Record<TributeKind, number[]>;
    for (const kind of TRIBUTE_KINDS) {
      const known = e.gifts[kind];
      const missing = Math.max(0, e.counts[kind] - known.length);
      out[kind] = [...Array.from({ length: missing }, (_, i) => i % TRIBUTE_VARIANTS[kind]), ...known];
    }
    return out;
  },

  letters(petId: string): LetterDto[] {
    return entry(petId).letters;
  },

  /** 这位访客今天是不是已经给它放过这种礼物了 */
  givenToday(petId: string, kind: TributeKind) {
    return readGiven().keys.includes(`${petId}:${kind}`);
  },

  /** 所有读到过的信里，这位访客自己写的 */
  mine(): Array<LetterDto & { petId: string }> {
    const out: Array<LetterDto & { petId: string }> = [];
    for (const [petId, e] of cache) for (const l of e.letters) if (l.mine) out.push({ ...l, petId });
    return out;
  },

  /**
   * 走进纪念角时读一次详情。带 since 时返回那之后别人留下了多少（主人回来时用）。
   */
  async load(petId: string, since?: number): Promise<TributeCounts | null> {
    const query = since === undefined ? '' : `?since=${since}`;
    const dto = await apiFetch<PetTributesDto>(`/api/pets/${petId}/tributes${query}`);
    const e = entry(petId);
    e.counts = dto.counts;
    e.gifts = dto.gifts;
    e.letters = dto.letters;
    e.detailed = true;
    return dto.fresh;
  },

  /**
   * 放一件礼物：马上记上，返回的 saved 在服务器收下后完成；
   * 没收下（比如今天已经放过）就把这一件拿掉，saved 以那个错误结束。
   */
  give(petId: string, kind: TributeKind): { saved: Promise<void> } {
    const e = entry(petId);
    const variant = Math.floor(Math.random() * TRIBUTE_VARIANTS[kind]);
    e.counts[kind]++;
    e.gifts[kind].push(variant);
    const saved = apiFetch<TributeDto>(`/api/pets/${petId}/tributes`, { method: 'POST', body: JSON.stringify({ kind }) }).then(
      (dto) => {
        // 外观以服务器挑的为准（别人看到的是那一个）
        const now = entry(petId);
        const at = now.gifts[kind].lastIndexOf(variant);
        if (at >= 0) now.gifts[kind][at] = dto.variant;
        markGiven(petId, kind);
      },
      (error) => {
        const now = entry(petId);
        now.counts[kind] = Math.max(0, now.counts[kind] - 1);
        const at = now.gifts[kind].lastIndexOf(variant);
        if (at >= 0) now.gifts[kind].splice(at, 1);
        if (error instanceof ApiError && error.code === 'already_today') markGiven(petId, kind);
        throw error;
      },
    );
    return { saved };
  },

  /** 写一封信：马上排到最前面，服务器没收下就拿掉 */
  write(petId: string, text: string): { saved: Promise<void> } {
    const e = entry(petId);
    const draft: LetterDto = { id: `draft:${Date.now()}:${Math.random()}`, text, createdAt: Date.now(), mine: true };
    e.counts.letter++;
    e.letters = [draft, ...e.letters];
    const saved = apiFetch<LetterDto>(`/api/pets/${petId}/letters`, { method: 'POST', body: JSON.stringify({ text }) }).then(
      (dto) => {
        const now = entry(petId);
        now.letters = now.letters.map((l) => (l.id === draft.id ? dto : l));
      },
      (error) => {
        const now = entry(petId);
        if (now.letters.some((l) => l.id === draft.id)) {
          now.letters = now.letters.filter((l) => l.id !== draft.id);
          now.counts.letter = Math.max(0, now.counts.letter - 1);
        }
        throw error;
      },
    );
    return { saved };
  },

  /** 拿掉一封信（写信的人或宠物的主人）；服务器删掉之后这里才拿掉 */
  async removeLetter(petId: string, letterId: string): Promise<void> {
    await apiFetch(`/api/pets/${petId}/letters/${letterId}`, { method: 'DELETE' });
    const e = entry(petId);
    if (e.letters.some((l) => l.id === letterId)) {
      e.letters = e.letters.filter((l) => l.id !== letterId);
      e.counts.letter = Math.max(0, e.counts.letter - 1);
    }
  },

  /** 还没存到服务器上的信（不能删、不能当编号用） */
  isDraft(letterId: string) {
    return letterId.startsWith('draft:');
  },
};
