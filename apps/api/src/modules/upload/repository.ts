import { eq } from 'drizzle-orm';
import type { Db } from '../../db';
import { upload } from '../../db/schema';

export type UploadRow = {
  id: string;
  ownerId: string;
  r2Key: string;
  publicUrl: string;
  originalName: string;
  contentType: string;
  status: string;
  createdAt: Date;
  completedAt: Date | null;
};

export function createUploadRepository(db: Db) {
  return {
    async createPending(row: UploadRow) {
      await db.insert(upload).values({
        id: row.id,
        ownerId: row.ownerId,
        r2Key: row.r2Key,
        publicUrl: row.publicUrl,
        originalName: row.originalName,
        contentType: row.contentType,
        status: row.status,
        createdAt: row.createdAt,
        completedAt: row.completedAt,
      });
    },

    async getById(id: string): Promise<UploadRow | null> {
      const [row] = await db.select().from(upload).where(eq(upload.id, id)).limit(1);
      return row ?? null;
    },

    async markCompleted(id: string, at: Date) {
      await db
        .update(upload)
        .set({ status: 'completed', completedAt: at })
        .where(eq(upload.id, id));
    },
  };
}

export type UploadRepository = ReturnType<typeof createUploadRepository>;