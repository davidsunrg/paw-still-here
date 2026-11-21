import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '../../db';
import { pet, petPhoto, upload } from '../../db/schema';
import type { PetPhotoJoined, PetRow } from './mapper';

type PhotoInsert = Array<{ id: string; uploadId: string; role: string; position: number }>;

function photoValues(petId: string, rows: PhotoInsert) {
  return rows.map((row) => ({
    id: row.id,
    petId,
    uploadId: row.uploadId,
    role: row.role,
    position: row.position,
  }));
}

export function createPetRepository(db: Db) {
  return {
    async listSlots(): Promise<number[]> {
      const rows = await db.select({ slot: pet.slot }).from(pet);
      return rows.map((row) => row.slot);
    },

    /** 宠物与首批照片关联必须一起成功或一起回滚 */
    async insertWithPhotos(row: Omit<PetRow, 'createdAt' | 'updatedAt'> & { createdAt: Date; updatedAt: Date }, photos: PhotoInsert) {
      const values = {
        id: row.id,
        ownerId: row.ownerId,
        slot: row.slot,
        name: row.name,
        species: row.species,
        breed: row.breed,
        birthDate: row.birthDate,
        passedDate: row.passedDate,
        message: row.message,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
      if (!photos.length) {
        await db.insert(pet).values(values);
        return;
      }
      await db.batch([
        db.insert(pet).values(values),
        db.insert(petPhoto).values(photoValues(row.id, photos)),
      ]);
    },

    /** 资料更新与相册替换同样保持原子；photos 为 undefined 时只改文字 */
    async updateWithPhotos(
      id: string,
      patch: Partial<Pick<PetRow, 'name' | 'species' | 'breed' | 'birthDate' | 'passedDate' | 'message' | 'updatedAt'>>,
      photos?: PhotoInsert,
    ) {
      const statement = db.update(pet).set(patch).where(eq(pet.id, id));
      if (photos === undefined) {
        await statement;
        return;
      }
      if (!photos.length) {
        await db.batch([statement, db.delete(petPhoto).where(eq(petPhoto.petId, id))]);
        return;
      }
      await db.batch([
        statement,
        db.delete(petPhoto).where(eq(petPhoto.petId, id)),
        db.insert(petPhoto).values(photoValues(id, photos)),
      ]);
    },

    async delete(id: string) {
      await db.batch([
        db.delete(petPhoto).where(eq(petPhoto.petId, id)),
        db.delete(pet).where(eq(pet.id, id)),
      ]);
    },

    async getById(id: string): Promise<PetRow | null> {
      const [row] = await db.select().from(pet).where(eq(pet.id, id)).limit(1);
      return row ?? null;
    },

    async listAllWithPhotos(): Promise<Array<{ pet: PetRow; photos: PetPhotoJoined[] }>> {
      const pets = await db.select().from(pet).orderBy(asc(pet.slot));
      if (pets.length === 0) return [];
      const ids = pets.map((p) => p.id);
      const photos = await db
        .select({
          id: petPhoto.id,
          uploadId: petPhoto.uploadId,
          petId: petPhoto.petId,
          publicUrl: upload.publicUrl,
          role: petPhoto.role,
          position: petPhoto.position,
        })
        .from(petPhoto)
        .innerJoin(upload, eq(petPhoto.uploadId, upload.id))
        .where(inArray(petPhoto.petId, ids));

      const byPet = new Map<string, PetPhotoJoined[]>();
      for (const p of photos) {
        const list = byPet.get(p.petId) ?? [];
        list.push({ id: p.id, uploadId: p.uploadId, publicUrl: p.publicUrl, role: p.role, position: p.position });
        byPet.set(p.petId, list);
      }
      return pets.map((row) => ({ pet: row, photos: byPet.get(row.id) ?? [] }));
    },

    async countMainPhoto(petId: string): Promise<number> {
      const [row] = await db
        .select({ c: sql<number>`count(*)` })
        .from(petPhoto)
        .where(and(eq(petPhoto.petId, petId), eq(petPhoto.role, 'main')));
      return Number(row?.c ?? 0);
    },
  };
}

export type PetRepository = ReturnType<typeof createPetRepository>;
