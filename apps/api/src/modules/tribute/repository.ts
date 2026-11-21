import { TRIBUTE_KINDS, type TributeCounts, type TributeKind } from '@paw/shared';
import { and, desc, eq, gt, gte, ne, sql } from 'drizzle-orm';
import type { Db } from '../../db';
import { letter, tribute } from '../../db/schema';

export type TributeRow = {
  id: string;
  petId: string;
  userId: string;
  kind: string;
  variant: number;
  day: string;
  createdAt: Date;
};

export type LetterRow = {
  id: string;
  petId: string;
  userId: string;
  text: string;
  createdAt: Date;
};

export function emptyCounts(): TributeCounts {
  return { flower: 0, candle: 0, snack: 0, toy: 0, letter: 0 };
}

function isKind(kind: string): kind is TributeKind {
  return (TRIBUTE_KINDS as readonly string[]).includes(kind);
}

export function createTributeRepository(db: Db) {
  return {
    /** 照片墙用：所有宠物各收到多少礼物和信，两条分组查询 */
    async countsByPet(): Promise<Map<string, TributeCounts>> {
      const [gifts, letters] = await Promise.all([
        db
          .select({ petId: tribute.petId, kind: tribute.kind, c: sql<number>`count(*)` })
          .from(tribute)
          .groupBy(tribute.petId, tribute.kind),
        db
          .select({ petId: letter.petId, c: sql<number>`count(*)` })
          .from(letter)
          .groupBy(letter.petId),
      ]);
      const out = new Map<string, TributeCounts>();
      const of = (petId: string) => {
        let counts = out.get(petId);
        if (!counts) out.set(petId, (counts = emptyCounts()));
        return counts;
      };
      for (const row of gifts) if (isKind(row.kind)) of(row.petId)[row.kind] = Number(row.c);
      for (const row of letters) of(row.petId).letter = Number(row.c);
      return out;
    },

    /**
     * 一只宠物的数量。传了 since 就只数那之后的；再传 exceptUserId 就不数这个人自己留的
     * （主人回来时看的是别人留下了什么）。
     */
    async countsForPet(petId: string, since?: Date, exceptUserId?: string): Promise<TributeCounts> {
      const giftWhere = and(
        eq(tribute.petId, petId),
        since ? gt(tribute.createdAt, since) : undefined,
        exceptUserId ? ne(tribute.userId, exceptUserId) : undefined,
      );
      const letterWhere = and(
        eq(letter.petId, petId),
        since ? gt(letter.createdAt, since) : undefined,
        exceptUserId ? ne(letter.userId, exceptUserId) : undefined,
      );
      const [gifts, letters] = await Promise.all([
        db.select({ kind: tribute.kind, c: sql<number>`count(*)` }).from(tribute).where(giftWhere).groupBy(tribute.kind),
        db.select({ c: sql<number>`count(*)` }).from(letter).where(letterWhere),
      ]);
      const counts = emptyCounts();
      for (const row of gifts) if (isKind(row.kind)) counts[row.kind] = Number(row.c);
      counts.letter = Number(letters[0]?.c ?? 0);
      return counts;
    },

    /** 某一种礼物最近的若干件的外观，新的在前 */
    async recentVariants(petId: string, kind: TributeKind, limit: number): Promise<number[]> {
      const rows = await db
        .select({ variant: tribute.variant })
        .from(tribute)
        .where(and(eq(tribute.petId, petId), eq(tribute.kind, kind)))
        .orderBy(desc(tribute.createdAt))
        .limit(limit);
      return rows.map((row) => row.variant);
    },

    async recentLetters(petId: string, limit: number): Promise<LetterRow[]> {
      return db.select().from(letter).where(eq(letter.petId, petId)).orderBy(desc(letter.createdAt)).limit(limit);
    },

    /** 当天已经送过同一种时，唯一索引会让这里抛错 */
    async insertTribute(row: TributeRow) {
      await db.insert(tribute).values(row);
    },

    async countLettersSince(petId: string, userId: string, since: Date): Promise<number> {
      const [row] = await db
        .select({ c: sql<number>`count(*)` })
        .from(letter)
        .where(and(eq(letter.petId, petId), eq(letter.userId, userId), gte(letter.createdAt, since)));
      return Number(row?.c ?? 0);
    },

    async insertLetter(row: LetterRow) {
      await db.insert(letter).values(row);
    },

    async getLetter(id: string): Promise<LetterRow | null> {
      const [row] = await db.select().from(letter).where(eq(letter.id, id)).limit(1);
      return row ?? null;
    },

    async deleteLetter(id: string) {
      await db.delete(letter).where(eq(letter.id, id));
    },
  };
}

export type TributeRepository = ReturnType<typeof createTributeRepository>;
