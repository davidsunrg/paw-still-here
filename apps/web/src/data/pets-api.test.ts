import { afterEach, describe, expect, it } from 'vitest';
import { FLOOR_CAPACITY, GALLERY_CAPACITY, type PetDto } from '@paw/shared';
import { applyGalleryFromApi } from './pets-api';
import { PETS, replacePets } from './pets';

const original = [...PETS];
afterEach(() => replacePets(original));

function dto(slot: number): PetDto {
  const mainUploadId = crypto.randomUUID();
  const galleryUploadId = crypto.randomUUID();
  return {
    id: crypto.randomUUID(),
    slot,
    name: 'Real pet',
    species: 'cat',
    breed: null,
    birthDate: null,
    passedDate: null,
    message: null,
    photos: [
      { id: crypto.randomUUID(), uploadId: mainUploadId, publicUrl: 'https://cdn.test/main', role: 'main', position: 0 },
      { id: crypto.randomUUID(), uploadId: galleryUploadId, publicUrl: 'https://cdn.test/gallery', role: 'gallery', position: 1 },
    ],
    tributes: { flower: 2, candle: 1, snack: 0, toy: 0, letter: 3 },
    isOwner: true,
    isReal: true,
  };
}

describe('gallery merge', () => {
  it('replaces only the real slot and keeps deterministic sample IDs elsewhere', () => {
    const real = dto(2);
    applyGalleryFromApi([real]);
    expect(PETS).toHaveLength(FLOOR_CAPACITY);
    expect(PETS[2]?.id).toBe(real.id);
    expect(PETS[0]?.id).toBe('pet-sample-1');
    expect(PETS[2]?.canManage).toBe(true);
    expect(PETS[2]?.passedDate).toBeUndefined();
    expect(PETS[2]?.message).toBeUndefined();
    expect(PETS[2]?.mainUploadId).toBe(real.photos[0]?.uploadId);
    expect(PETS[2]?.photoUploads?.[0]?.uploadId).toBe(real.photos[1]?.uploadId);
  });

  it('restores the same sample pet when a real memorial is deleted', () => {
    const real = dto(2);
    applyGalleryFromApi([real]);
    applyGalleryFromApi([]);
    expect(PETS[2]?.id).toBe('pet-sample-3');
    expect(PETS[2]?.name).toBe(original[2]?.name);
  });

  it('keeps floors above the first empty instead of filling samples', () => {
    applyGalleryFromApi([]);
    expect(PETS).toHaveLength(FLOOR_CAPACITY);
    expect(PETS[FLOOR_CAPACITY]).toBeUndefined();
    expect(PETS.filter(Boolean)).toHaveLength(FLOOR_CAPACITY);
  });
});
