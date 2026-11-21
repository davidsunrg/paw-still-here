import {
  LETTERS_PER_DAY,
  TRIBUTE_KINDS,
  TRIBUTE_VARIANTS,
  type LetterDto,
  type PetTributesDto,
  type TributeDto,
  type TributeKind,
} from '@paw/shared';
import { err, errorChainMatches } from '../../lib/errors';
import type { PetRepository } from '../pet/repository';
import type { LetterRow, TributeRepository } from './repository';

/** 详情里每种礼物最多带回多少件的外观、最多带回多少封信 */
const GIFTS_SHOWN = 60;
const LETTERS_SHOWN = 80;

type Clock = { now: () => number; random: () => number };

/** UTC 日期：「一天一次」按它算，不随访客的时区变 */
function dayOf(ms: number) {
  return new Date(ms).toISOString().slice(0, 10);
}

function toLetterDto(row: LetterRow, viewerUserId?: string | null): LetterDto {
  return { id: row.id, text: row.text, createdAt: row.createdAt.getTime(), mine: !!viewerUserId && row.userId === viewerUserId };
}

function isDailyViolation(error: unknown) {
  return errorChainMatches(error, /tribute_daily_unique|UNIQUE constraint failed: tribute\./i);
}

export function createTributeService(
  repo: TributeRepository,
  petRepo: Pick<PetRepository, 'getById'>,
  clock: Clock = { now: Date.now, random: Math.random },
) {
  async function requirePet(petId: string) {
    const pet = await petRepo.getById(petId);
    if (!pet) throw err.notFound('pet_not_found');
    return pet;
  }

  return {
    /** 进入纪念角时读：总数、礼物外观、信；带了 since 再数一下那之后别人留下的 */
    async summary(petId: string, viewerUserId?: string | null, since?: number): Promise<PetTributesDto> {
      await requirePet(petId);
      const [counts, letters, fresh, ...variants] = await Promise.all([
        repo.countsForPet(petId),
        repo.recentLetters(petId, LETTERS_SHOWN),
        since === undefined ? null : repo.countsForPet(petId, new Date(since), viewerUserId ?? undefined),
        ...TRIBUTE_KINDS.map((kind) => repo.recentVariants(petId, kind, GIFTS_SHOWN)),
      ]);
      const gifts = { flower: [], candle: [], snack: [], toy: [] } as PetTributesDto['gifts'];
      // 查出来新的在前；摆进纪念角时按放入的先后，旧的在前
      TRIBUTE_KINDS.forEach((kind, i) => (gifts[kind] = [...(variants[i] ?? [])].reverse()));
      return { counts, gifts, letters: letters.map((row) => toLetterDto(row, viewerUserId)), fresh };
    },

    async give(userId: string, petId: string, kind: TributeKind): Promise<TributeDto> {
      await requirePet(petId);
      const now = clock.now();
      const variant = Math.floor(clock.random() * TRIBUTE_VARIANTS[kind]);
      try {
        await repo.insertTribute({ id: crypto.randomUUID(), petId, userId, kind, variant, day: dayOf(now), createdAt: new Date(now) });
      } catch (error) {
        if (isDailyViolation(error)) throw err.conflict('already_today');
        throw error;
      }
      return { kind, variant };
    },

    async writeLetter(userId: string, petId: string, text: string): Promise<LetterDto> {
      await requirePet(petId);
      const now = clock.now();
      const dayStart = new Date(`${dayOf(now)}T00:00:00.000Z`);
      if ((await repo.countLettersSince(petId, userId, dayStart)) >= LETTERS_PER_DAY) throw err.conflict('letter_limit');
      const row: LetterRow = { id: crypto.randomUUID(), petId, userId, text, createdAt: new Date(now) };
      await repo.insertLetter(row);
      return toLetterDto(row, userId);
    },

    /** 写信的人自己，或者这只宠物的主人，可以把信拿掉 */
    async removeLetter(userId: string, petId: string, letterId: string): Promise<void> {
      const pet = await requirePet(petId);
      const row = await repo.getLetter(letterId);
      if (!row || row.petId !== petId) throw err.notFound('letter_not_found');
      if (row.userId !== userId && pet.ownerId !== userId) throw err.forbidden();
      await repo.deleteLetter(letterId);
    },
  };
}

export type TributeService = ReturnType<typeof createTributeService>;
