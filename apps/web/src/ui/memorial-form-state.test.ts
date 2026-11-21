import { describe, expect, it } from 'vitest';
import type { Pet } from '../data/pets';
import {
  emptyMemorialForm,
  memorialFormFromPet,
  memorialFormToInput,
  moveGalleryPhoto,
  validateMemorialForm,
} from './memorial-form-state';

function pet(): Pet {
  return {
    id: crypto.randomUUID(),
    slot: 0,
    name: 'Mochi',
    species: 'cat',
    breed: 'Ragdoll',
    birthDate: '2012-01-01',
    passedDate: '2024-01-01',
    photoUrl: 'https://cdn.test/main',
    mainUploadId: 'main-upload',
    photoUploads: [{ uploadId: 'first', url: 'https://cdn.test/first' }, { uploadId: 'second', url: 'https://cdn.test/second' }],
    photos: ['https://cdn.test/first', 'https://cdn.test/second'],
    message: 'hello',
    flowers: 0,
    candles: 0,
    floor: 1,
    section: 'A',
    cell: 1,
    fur: '#fff',
    bg: 0,
    isReal: true,
    canManage: true,
  };
}

describe('memorial form state', () => {
  it('requires a name and a main photo, and needs nothing else', () => {
    const named = { ...emptyMemorialForm(), name: 'Minimal' };
    expect(validateMemorialForm(named)).toBe('image_required');
    const ready = {
      ...named,
      main: { key: 'main', uploadId: 'main-upload', url: 'https://cdn.test/main', status: 'existing' as const },
    };
    expect(validateMemorialForm(ready)).toBeNull();
    expect(memorialFormToInput(ready)).toEqual({ name: 'Minimal', species: 'dog', breed: undefined, birthDate: undefined, passedDate: undefined, message: undefined, mainUploadId: 'main-upload', galleryUploadIds: [] });
  });

  it('keeps existing upload IDs and reorders the album without losing photos', () => {
    const state = memorialFormFromPet(pet());
    const moved = moveGalleryPhoto(state, 1, -1);
    expect(moved.gallery.map((photo) => photo.uploadId)).toEqual(['second', 'first']);
    expect(memorialFormToInput(moved).mainUploadId).toBe('main-upload');
    expect(memorialFormToInput(moved).galleryUploadIds).toEqual(['second', 'first']);
    expect(state.gallery.map((photo) => photo.uploadId)).toEqual(['first', 'second']);
  });

  it('uses empty strings on update to clear old optional fields', () => {
    const state = { ...memorialFormFromPet(pet()), birthDate: '', passedDate: '', message: '', breed: '' };
    expect(memorialFormToInput(state, true)).toMatchObject({ birthDate: '', passedDate: '', message: '', breed: '' });
  });

  it('requires a name but allows empty optional fields', () => {
    expect(validateMemorialForm(emptyMemorialForm())).toBe('name_required');
  });
});
