import type { CreatePetInput, PetDto, UpdatePetInput } from '@paw/shared';
import { GALLERY_CAPACITY } from '@paw/shared';
import { err } from '../../lib/errors';
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

export function createPetService(petRepo: PetRepository, uploadRepo: UploadRepository) {
  return {
  findFreeSlot(used: number[]) {
    return findFreeSlot(used);
  },

  async list(viewerUserId?: string | null): Promise<PetDto[]> {
    const rows = await petRepo.listAllWithPhotos();
    return rows.map(({ pet: row, photos }) => toPetDto(row, photos, viewerUserId));
  },

  async get(id: string, viewerUserId?: string | null): Promise<PetDto> {
    const rows = await petRepo.listAllWithPhotos();
    const hit = rows.find((r) => r.pet.id === id);
    if (!hit) throw err.notFound('pet_not_found');
    return toPetDto(hit.pet, hit.photos, viewerUserId);
  },

  async create(ownerId: string, input: CreatePetInput): Promise<PetDto> {
    const used = await petRepo.listSlots();
    const slot = findFreeSlot(used);
    if (slot === null) throw err.galleryFull();

    const uploadIds = [
      ...(input.mainUploadId ? [input.mainUploadId] : []),
      ...(input.galleryUploadIds ?? []),
    ];
    await assertCompletedUploads(ownerId, uploadIds, uploadRepo);

    const id = crypto.randomUUID();
    const now = new Date();
    try {
      await petRepo.insert({
        id,
        ownerId,
        slot,
        name: input.name,
        species: input.species,
        breed: input.breed ?? null,
        birthDate: input.birthDate ?? null,
        passedDate: input.passedDate,
        message: input.message,
        createdAt: now,
        updatedAt: now,
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw err.galleryFull();
      throw e;
    }

    const photoRows = buildPhotoRows(id, input.mainUploadId, input.galleryUploadIds ?? []);
    if (photoRows.length) await petRepo.replacePhotos(id, photoRows);

    return this.get(id, ownerId);
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
    await petRepo.update(id, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.species !== undefined ? { species: input.species } : {}),
      ...(input.breed !== undefined ? { breed: input.breed ?? null } : {}),
      ...(input.birthDate !== undefined ? { birthDate: input.birthDate ?? null } : {}),
      ...(input.passedDate !== undefined ? { passedDate: input.passedDate } : {}),
      ...(input.message !== undefined ? { message: input.message } : {}),
      updatedAt: now,
    });

    if (input.mainUploadId !== undefined || input.galleryUploadIds !== undefined) {
      const mainId = input.mainUploadId;
      const galleryIds = input.galleryUploadIds ?? [];
      const photoRows = buildPhotoRows(id, mainId, galleryIds);
      await petRepo.replacePhotos(id, photoRows);
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
  for (const uploadId of galleryIds) {
    if (uploadId === mainUploadId) continue;
    rows.push({ id: crypto.randomUUID(), uploadId, role: 'gallery', position: pos++ });
  }
  return rows;
}

function isUniqueViolation(e: unknown) {
  return e instanceof Error && /unique|UNIQUE|constraint/i.test(e.message);
}