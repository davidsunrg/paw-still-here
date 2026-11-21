import type { CreatePetInput, PetDto, TributeCounts, UpdatePetInput } from '@paw/shared';
import { GALLERY_CAPACITY } from '@paw/shared';
import { err, errorChainMatches } from '../../lib/errors';
import type { UploadRepository } from '../upload/repository';
import type { PetRepository } from './repository';
import { toPetDto } from './mapper';

function findFreeSlot(used: number[]): number | null {
  const set = new Set(used);
  for (let i = 0; i < GALLERY_CAPACITY; i++) {
    if (!set.has(i)) return i;
  }
  return null;
}

/** 照片墙上要带的礼物数量从哪儿来；不给就都是 0 */
export type TributeCountsSource = { countsByPet(): Promise<Map<string, TributeCounts>> };

export function createPetService(
  petRepo: PetRepository,
  uploadRepo: UploadRepository,
  tributes?: TributeCountsSource,
) {
  const loadCounts = () => (tributes ? tributes.countsByPet() : Promise.resolve(new Map<string, TributeCounts>()));

  return {
    findFreeSlot(used: number[]) {
      return findFreeSlot(used);
    },

    async list(viewerUserId?: string | null): Promise<PetDto[]> {
      const [rows, counts] = await Promise.all([petRepo.listAllWithPhotos(), loadCounts()]);
      return rows.map(({ pet: row, photos }) => toPetDto(row, photos, viewerUserId, counts.get(row.id)));
    },

    async get(id: string, viewerUserId?: string | null): Promise<PetDto> {
      const [rows, counts] = await Promise.all([petRepo.listAllWithPhotos(), loadCounts()]);
      const hit = rows.find((row) => row.pet.id === id);
      if (!hit) throw err.notFound('pet_not_found');
      return toPetDto(hit.pet, hit.photos, viewerUserId, counts.get(id));
    },

    async create(ownerId: string, input: CreatePetInput): Promise<PetDto> {
      const uploadIds = [
        ...(input.mainUploadId ? [input.mainUploadId] : []),
        ...(input.galleryUploadIds ?? []),
      ];
      await assertCompletedUploads(ownerId, uploadIds, uploadRepo);

      // 唯一索引负责最后一道并发保护；冲突时重新找最小空位，而不是误报墙满
      for (let attempt = 0; attempt < GALLERY_CAPACITY; attempt++) {
        const used = await petRepo.listSlots();
        const slot = findFreeSlot(used);
        if (slot === null) throw err.galleryFull();
        const id = crypto.randomUUID();
        const now = new Date();
        const photoRows = buildPhotoRows(id, input.mainUploadId, input.galleryUploadIds ?? []);
        try {
          await petRepo.insertWithPhotos({
            id,
            ownerId,
            slot,
            name: input.name,
            species: input.species,
            breed: input.breed ?? null,
            birthDate: input.birthDate ?? null,
            passedDate: input.passedDate ?? '',
            message: input.message ?? '',
            createdAt: now,
            updatedAt: now,
          }, photoRows);
          return await this.get(id, ownerId);
        } catch (error) {
          if (isSlotUniqueViolation(error)) continue;
          throw error;
        }
      }
      throw err.galleryFull();
    },

    async update(ownerId: string, id: string, input: UpdatePetInput): Promise<PetDto> {
      const row = await petRepo.getById(id);
      if (!row) throw err.notFound('pet_not_found');
      if (row.ownerId !== ownerId) throw err.forbidden();

      const uploadIds = [
        ...(input.mainUploadId ? [input.mainUploadId] : []),
        ...(input.galleryUploadIds ?? []),
      ];
      if (uploadIds.length) await assertCompletedUploads(ownerId, uploadIds, uploadRepo);

      const now = new Date();
      const patch = {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.species !== undefined ? { species: input.species } : {}),
        ...(input.breed !== undefined ? { breed: input.breed ?? null } : {}),
        ...(input.birthDate !== undefined ? { birthDate: input.birthDate ?? null } : {}),
        ...(input.passedDate !== undefined ? { passedDate: input.passedDate } : {}),
        ...(input.message !== undefined ? { message: input.message } : {}),
        updatedAt: now,
      };
      if (input.mainUploadId !== undefined || input.galleryUploadIds !== undefined) {
        const photoRows = buildPhotoRows(id, input.mainUploadId, input.galleryUploadIds ?? []);
        await petRepo.updateWithPhotos(id, patch, photoRows);
      } else {
        await petRepo.updateWithPhotos(id, patch);
      }

      return this.get(id, ownerId);
    },

    async remove(ownerId: string, id: string): Promise<void> {
      const row = await petRepo.getById(id);
      if (!row) throw err.notFound('pet_not_found');
      if (row.ownerId !== ownerId) throw err.forbidden();
      await petRepo.delete(id);
    },
  };
}

export type PetService = ReturnType<typeof createPetService>;

async function assertCompletedUploads(
  ownerId: string,
  ids: string[],
  uploadRepo: UploadRepository,
) {
  const unique = [...new Set(ids)];
  for (const uploadId of unique) {
    const row = await uploadRepo.getById(uploadId);
    if (!row) throw err.badRequest('upload_not_found');
    if (row.ownerId !== ownerId) throw err.forbidden();
    if (row.status !== 'completed') throw err.badRequest('upload_not_completed');
  }
}

function buildPhotoRows(petId: string, mainUploadId: string | undefined, galleryIds: string[]) {
  const rows: Array<{ id: string; uploadId: string; role: string; position: number }> = [];
  let pos = 0;
  if (mainUploadId) {
    rows.push({ id: crypto.randomUUID(), uploadId: mainUploadId, role: 'main', position: pos++ });
  }
  for (const uploadId of new Set(galleryIds)) {
    if (uploadId === mainUploadId) continue;
    rows.push({ id: crypto.randomUUID(), uploadId, role: 'gallery', position: pos++ });
  }
  return rows;
}

function isSlotUniqueViolation(error: unknown) {
  return errorChainMatches(error, /pet_slot_unique|UNIQUE constraint failed: pet\.slot/i);
}
