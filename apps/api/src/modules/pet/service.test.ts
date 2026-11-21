import { describe, expect, it, vi } from 'vitest';
import { createPetService } from './service';
import type { PetRepository } from './repository';
import type { UploadRepository } from '../upload/repository';
import type { PetRow } from './mapper';

function row(id: string, slot: number, ownerId = 'owner'): PetRow {
  return {
    id,
    ownerId,
    slot,
    name: 'Test pet',
    species: 'dog',
    breed: null,
    birthDate: '2010-01-01',
    passedDate: '2024-01-01',
    message: 'hello',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function repositories(initial: Array<{ pet: PetRow; photos?: Array<{ id: string; uploadId: string; role: string; position: number }> }> = []) {
  const rows = initial.map((entry) => ({
    pet: entry.pet,
    photos: (entry.photos ?? []).map((photo) => ({ ...photo, publicUrl: `https://cdn.test/${photo.uploadId}` })),
  }));
  const repo = {
    listSlots: vi.fn(async () => rows.map((entry) => entry.pet.slot)),
    listAllWithPhotos: vi.fn(async () => rows),
    getById: vi.fn(async (id: string) => rows.find((entry) => entry.pet.id === id)?.pet ?? null),
    insertWithPhotos: vi.fn(async (pet: PetRow, photos: Array<{ id: string; uploadId: string; role: string; position: number }>) => {
      rows.push({ pet, photos: photos.map((photo) => ({ ...photo, publicUrl: `https://cdn.test/${photo.uploadId}` })) });
    }),
    updateWithPhotos: vi.fn(async (id: string, patch: Partial<PetRow>, photos?: Array<{ id: string; uploadId: string; role: string; position: number }>) => {
      const entry = rows.find((item) => item.pet.id === id);
      if (!entry) return;
      Object.assign(entry.pet, patch);
      if (photos) entry.photos = photos.map((photo) => ({ ...photo, publicUrl: `https://cdn.test/${photo.uploadId}` }));
    }),
    delete: vi.fn(async (id: string) => {
      const index = rows.findIndex((entry) => entry.pet.id === id);
      if (index >= 0) rows.splice(index, 1);
    }),
  };
  const uploads = {
    getById: vi.fn(async (id: string) => ({ id, ownerId: 'owner', status: 'completed' })),
  };
  return { repo: repo as unknown as PetRepository, uploads: uploads as unknown as UploadRepository };
}

describe('pet slot allocation', () => {
  it('picks smallest free slot and detects a full wall', () => {
    const { repo, uploads } = repositories();
    const service = createPetService(repo, uploads);
    expect(service.findFreeSlot([0, 2])).toBe(1);
    expect(service.findFreeSlot([0, 1, 2])).toBe(3);
    expect(service.findFreeSlot(Array.from({ length: 100 }, (_, i) => i))).toBeNull();
  });
});

describe('pet creation and updates', () => {
  it('creates with only name and species, mapping empty optional fields to null', async () => {
    const { repo, uploads } = repositories();
    const service = createPetService(repo, uploads);
    const dto = await service.create('owner', { name: 'Only name', species: 'cat' });
    expect(dto.slot).toBe(0);
    expect(dto.passedDate).toBeNull();
    expect(dto.message).toBeNull();
    expect(dto.photos).toEqual([]);
    expect(repo.insertWithPhotos).toHaveBeenCalledTimes(1);
  });

  it('retries the next smallest slot after a concurrent unique conflict', async () => {
    const { repo, uploads } = repositories();
    repo.listSlots = vi.fn()
      .mockResolvedValueOnce([0])
      .mockResolvedValueOnce([0, 1]);
    repo.insertWithPhotos = vi.fn()
      .mockRejectedValueOnce(new Error('UNIQUE constraint failed: pet.slot'))
        .mockImplementation(async (pet: PetRow, photos: Array<{ id: string; uploadId: string; role: string; position: number }>) => {
          (repo.listAllWithPhotos as ReturnType<typeof vi.fn>).mockResolvedValue([{ pet, photos }]);
        });
    const service = createPetService(repo, uploads);
    const dto = await service.create('owner', { name: 'Concurrent', species: 'dog' });
    expect(dto.slot).toBe(2);
    expect(repo.insertWithPhotos).toHaveBeenCalledTimes(2);
  });

  it('rejects gallery_full before writing when every slot is occupied', async () => {
    const { repo, uploads } = repositories(Array.from({ length: 100 }, (_, i) => ({ pet: row(`pet-${i}`, i) })));
    const service = createPetService(repo, uploads);
    await expect(service.create('owner', { name: 'No space', species: 'bird' })).rejects.toMatchObject({ code: 'gallery_full' });
    expect(repo.insertWithPhotos).not.toHaveBeenCalled();
  });

  it('rejects another user\'s completed upload before creating a pet', async () => {
    const { repo, uploads } = repositories();
    uploads.getById = vi.fn(async (id: string) => ({
      id,
      ownerId: 'someone-else',
      r2Key: `users/someone-else/${id}`,
      publicUrl: `https://cdn.test/${id}`,
      originalName: 'pet.png',
      contentType: 'image/png',
      status: 'completed',
      createdAt: new Date(),
      completedAt: new Date(),
    }));
    const service = createPetService(repo, uploads);
    await expect(service.create('owner', { name: 'Wrong owner', species: 'dog', mainUploadId: crypto.randomUUID() }))
      .rejects.toMatchObject({ code: 'forbidden' });
    expect(repo.insertWithPhotos).not.toHaveBeenCalled();
  });

  it('clears optional text and saves the complete ordered album atomically', async () => {
    const { repo, uploads } = repositories([{ pet: row('pet-1', 0) }]);
    const service = createPetService(repo, uploads);
    const mainUploadId = crypto.randomUUID();
    const second = crypto.randomUUID();
    const first = crypto.randomUUID();
    await service.update('owner', 'pet-1', {
      mainUploadId,
      galleryUploadIds: [second, first],
      birthDate: '',
      passedDate: '',
      message: '',
    });
    expect(repo.updateWithPhotos).toHaveBeenCalledWith(
      'pet-1',
      expect.objectContaining({ birthDate: '', passedDate: '', message: '' }),
      [
        expect.objectContaining({ uploadId: mainUploadId, role: 'main', position: 0 }),
        expect.objectContaining({ uploadId: second, role: 'gallery', position: 1 }),
        expect.objectContaining({ uploadId: first, role: 'gallery', position: 2 }),
      ],
    );
  });

  it('forbids update and delete by a non-owner', async () => {
    const { repo, uploads } = repositories([{ pet: row('pet-1', 0, 'different-owner') }]);
    const service = createPetService(repo, uploads);
    await expect(service.update('owner', 'pet-1', { name: 'Not yours' })).rejects.toMatchObject({ code: 'forbidden' });
    await expect(service.remove('owner', 'pet-1')).rejects.toMatchObject({ code: 'forbidden' });
    expect(repo.updateWithPhotos).not.toHaveBeenCalled();
    expect(repo.delete).not.toHaveBeenCalled();
  });
});
