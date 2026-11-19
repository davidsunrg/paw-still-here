import { STR } from '../strings';
import { petById, type Pet } from './pets';

/**
 * 数据层：献花、蜡烛、留言目前保存在 localStorage。
 * 以后接后端时，只需要替换这个文件里的读写实现。
 */

export interface Message {
  text: string;
  time: number;
  petId?: string;
}

interface PetRecord {
  flowers: number;
  candles: number;
  comments: Message[];
}

interface State {
  pets: Record<string, PetRecord>;
  guestbook: Message[];
  lanterns: number;
}

const KEY = 'jinian:v1';

function load(): State {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as Partial<State>;
      return { pets: s.pets ?? {}, guestbook: s.guestbook ?? [], lanterns: s.lanterns ?? 0 };
    }
  } catch {
    // 数据损坏或无法访问 localStorage 时，从空状态开始
  }
  return { pets: {}, guestbook: [], lanterns: 0 };
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
  return (state.pets[id] ??= { flowers: 0, candles: 0, comments: [] });
}

export const store = {
  /** 宠物当前的献花 / 蜡烛总数（示例基数 + 访客新增） */
  stats(pet: Pet) {
    const r = state.pets[pet.id];
    return { flowers: pet.flowers + (r?.flowers ?? 0), candles: pet.candles + (r?.candles ?? 0) };
  },
  addFlower(pet: Pet) {
    record(pet.id).flowers++;
    save();
  },
  addCandle(pet: Pet) {
    record(pet.id).candles++;
    save();
  },
  comments(pet: Pet): Message[] {
    return [...(state.pets[pet.id]?.comments ?? [])].reverse();
  },
  addComment(pet: Pet, text: string) {
    record(pet.id).comments.push({ text, time: Date.now(), petId: pet.id });
    save();
  },
  addGuestbook(text: string) {
    state.guestbook.push({ text, time: Date.now() });
    save();
  },
  /** 全馆最新留言：留言簿 + 各宠物留言，按时间倒序 */
  recent(limit = 40): Array<Message & { petName?: string }> {
    const all: Array<Message & { petName?: string }> = [...state.guestbook];
    for (const [id, r] of Object.entries(state.pets)) {
      for (const c of r.comments) all.push({ ...c, petName: petById.get(id)?.name });
    }
    all.sort((a, b) => b.time - a.time);
    const samples = STR.sampleGuestbook.map((text) => ({ text, time: 0 }));
    return [...all, ...samples].slice(0, limit);
  },
  addLantern() {
    state.lanterns++;
    save();
    return state.lanterns;
  },
};
