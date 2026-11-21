import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '../../db';
import { pet, petPhoto, upload } from '../../db/schema';
import type { PetPhotoJoined, PetRow } from './mapper';

export function createPetRepository(db: Db) {
  return {
    async listSlots(): Promise<number[]> {
      const rows = await db.select({ slot: pet.slot }).from(pet);
      return rows.map((r) => r.slot);
    },

    async insert(row: Omit<PetRow, 'createdAt' | 'updatedAt'> & { createdAt: Date; updatedAt: Date }) {
      await db.insert(pet).values({
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
      });
    },

    async update(
      id: string,
      patch: Partial<
        Pick<PetRow, 'name' | 'species' | 'breed' | 'birthDate' | 'passedDate' | 'message' | 'updatedAt'>
      >,
    ) {
      await db.update(pet).set(patch).where(eq(pet.id, id));
    },

    async delete(id: string) {
      await db.delete(petPhoto).where(eq(petPhoto.petId, id));
      await db.delete(pet).where(eq(pet.id, id));
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
        list.push({ id: p.id, publicUrl: p.publicUrl, role: p.role, position: p.position });
        byPet.set(p.petId, list);
      }
      return pets.map((row) => ({ pet: row, photos: byPet.get(row.id) ?? [] }));
    },

    async replacePhotos(
      petId: string,
      rows: Array<{ id: string; uploadId: string; role: string; position: number }>,
    ) {
      await db.delete(petPhoto).where(eq(petPhoto.petId, petId));
      if (rows.length > 0) {
        await db.insert(petPhoto).values(
          rows.map((r) => ({
            id: r.id,
            petId,
            uploadId: r.uploadId,
            role: r.role,
            position: r.position,
          })),
        );
      }
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