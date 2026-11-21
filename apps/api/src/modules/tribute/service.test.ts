import { describe, expect, it } from 'vitest';
import type { TributeCounts, TributeKind } from '@paw/shared';
import type { PetRepository } from '../pet/repository';
import { emptyCounts, type LetterRow, type TributeRepository, type TributeRow } from './repository';
import { createTributeService } from './service';

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 10, 21, 10, 0, 0);

/** 内存里的假仓库，行为照着真表：同一天同一种只能有一件 */
function setup() {
  const tributes: TributeRow[] = [];
  const letters: LetterRow[] = [];
  const clock = { at: T0, roll: 0 };

  const repo = {
    async countsByPet() {
      return new Map<string, TributeCounts>();
    },
    async countsForPet(petId: string, since?: Date, exceptUserId?: string) {
      const keep = (row: { petId: string; userId: string; createdAt: Date }) =>
        row.petId === petId && (!since || row.createdAt > since) && (!exceptUserId || row.userId !== exceptUserId);
      const counts = emptyCounts();
      for (const row of tributes.filter(keep)) counts[row.kind as TributeKind]++;
      counts.letter = letters.filter(keep).length;
      return counts;
    },
    async recentVariants(petId: string, kind: TributeKind, limit: number) {
      return tributes
        .filter((row) => row.petId === petId && row.kind === kind)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, limit)
        .map((row) => row.variant);
    },
    async recentLetters(petId: string, limit: number) {
      return letters
        .filter((row) => row.petId === petId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, limit);
    },
    async insertTribute(row: TributeRow) {
      const clash = tributes.some((t) => t.petId === row.petId && t.userId === row.userId && t.kind === row.kind && t.day === row.day);
      // 和真的一样：drizzle 包了一层，冲突的原话在 cause 里
      if (clash) {
        throw new Error('Failed query: insert into "tribute"', {
          cause: new Error('D1_ERROR: UNIQUE constraint failed: tribute.pet_id, tribute.user_id, tribute.kind, tribute.day: SQLITE_CONSTRAINT'),
        });
      }
      tributes.push(row);
    },
    async countLettersSince(petId: string, userId: string, since: Date) {
      return letters.filter((row) => row.petId === petId && row.userId === userId && row.createdAt >= since).length;
    },
    async insertLetter(row: LetterRow) {
      letters.push(row);
    },
    async getLetter(id: string) {
      return letters.find((row) => row.id === id) ?? null;
    },
    async deleteLetter(id: string) {
      const index = letters.findIndex((row) => row.id === id);
      if (index >= 0) letters.splice(index, 1);
    },
  } satisfies TributeRepository;

  const pets = {
    async getById(id: string) {
      return id === 'pet-1' || id === 'pet-2' ? { id, ownerId: 'owner' } : null;
    },
  } as unknown as Pick<PetRepository, 'getById'>;

  const service = createTributeService(repo, pets, { now: () => clock.at, random: () => clock.roll });
  return { service, clock, tributes, letters };
}

describe('leaving gifts', () => {
  it('stores a gift with a server-chosen variant inside the range for its kind', async () => {
    const { service, clock, tributes } = setup();
    clock.roll = 0.99;
    expect(await service.give('visitor', 'pet-1', 'flower')).toEqual({ kind: 'flower', variant: 4 });
    expect(await service.give('visitor', 'pet-1', 'toy')).toEqual({ kind: 'toy', variant: 1 });
    expect(tributes.map((row) => row.day)).toEqual(['2026-11-21', '2026-11-21']);
  });

  it('allows one of each kind per visitor per pet per UTC day', async () => {
    const { service, clock } = setup();
    await service.give('visitor', 'pet-1', 'flower');
    await expect(service.give('visitor', 'pet-1', 'flower')).rejects.toMatchObject({ code: 'already_today', status: 409 });
    // 别的种类、别的宠物、别的人都不受影响
    await service.give('visitor', 'pet-1', 'candle');
    await service.give('visitor', 'pet-2', 'flower');
    await service.give('someone-else', 'pet-1', 'flower');
    // 过了 UTC 零点又可以了
    clock.at = Date.UTC(2026, 10, 22, 0, 0, 1);
    await service.give('visitor', 'pet-1', 'flower');
    expect((await service.summary('pet-1')).counts.flower).toBe(3);
  });

  it('refuses a pet that does not exist', async () => {
    const { service } = setup();
    await expect(service.give('visitor', 'nope', 'flower')).rejects.toMatchObject({ code: 'pet_not_found', status: 404 });
    await expect(service.summary('nope')).rejects.toMatchObject({ status: 404 });
  });
});

describe('summary', () => {
  it('returns totals, gift variants oldest first and letters newest first', async () => {
    const { service, clock } = setup();
    clock.roll = 0;
    await service.give('a', 'pet-1', 'flower');
    clock.at += 1000;
    clock.roll = 0.5;
    await service.give('b', 'pet-1', 'flower');
    await service.writeLetter('a', 'pet-1', 'first');
    clock.at += 1000;
    await service.writeLetter('b', 'pet-1', 'second');

    const summary = await service.summary('pet-1', 'a');
    expect(summary.counts).toEqual({ flower: 2, candle: 0, snack: 0, toy: 0, letter: 2 });
    expect(summary.gifts.flower).toEqual([0, 2]);
    expect(summary.letters.map((letter) => [letter.text, letter.mine])).toEqual([['second', false], ['first', true]]);
    expect(summary.fresh).toBeNull();
  });

  it('counts what others left since the owner last looked, not the owner\'s own', async () => {
    const { service, clock } = setup();
    await service.give('friend', 'pet-1', 'flower');
    const lastSeen = clock.at;
    clock.at += DAY;
    await service.give('friend', 'pet-1', 'flower');
    await service.give('owner', 'pet-1', 'candle');
    await service.writeLetter('friend', 'pet-1', 'thinking of you');
    await service.writeLetter('owner', 'pet-1', 'miss you');

    const summary = await service.summary('pet-1', 'owner', lastSeen);
    expect(summary.fresh).toEqual({ flower: 1, candle: 0, snack: 0, toy: 0, letter: 1 });
  });
});

describe('letters', () => {
  it('limits how many letters one visitor can leave for a pet in a day', async () => {
    const { service, clock } = setup();
    for (let i = 0; i < 5; i++) await service.writeLetter('visitor', 'pet-1', `letter ${i}`);
    await expect(service.writeLetter('visitor', 'pet-1', 'one more')).rejects.toMatchObject({ code: 'letter_limit', status: 409 });
    await service.writeLetter('visitor', 'pet-2', 'another pet is fine');
    clock.at += DAY;
    await service.writeLetter('visitor', 'pet-1', 'a new day');
  });

  it('lets the author or the pet owner remove a letter, and nobody else', async () => {
    const { service, letters } = setup();
    const mine = await service.writeLetter('visitor', 'pet-1', 'mine');
    const other = await service.writeLetter('visitor', 'pet-1', 'other');
    await expect(service.removeLetter('stranger', 'pet-1', mine.id)).rejects.toMatchObject({ status: 403 });
    await expect(service.removeLetter('visitor', 'pet-2', mine.id)).rejects.toMatchObject({ status: 404 });
    await service.removeLetter('visitor', 'pet-1', mine.id);
    await service.removeLetter('owner', 'pet-1', other.id);
    expect(letters).toEqual([]);
  });
});
