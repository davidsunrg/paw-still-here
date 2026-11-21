import type { CreatePetInput, Species } from '@paw/shared';
import type { Pet } from '../data/pets';

export type EditorPhoto = {
  key: string;
  uploadId?: string;
  url: string;
  file?: File;
  objectUrl?: string;
  status: 'existing' | 'pending' | 'uploading' | 'completed' | 'error';
};

export type MemorialFormState = {
  name: string;
  species: Species;
  breed: string;
  birthDate: string;
  passedDate: string;
  message: string;
  main: EditorPhoto | null;
  gallery: EditorPhoto[];
};

export function emptyMemorialForm(): MemorialFormState {
  return { name: '', species: 'dog', breed: '', birthDate: '', passedDate: '', message: '', main: null, gallery: [] };
}

export function memorialFormFromPet(pet: Pet): MemorialFormState {
  return {
    name: pet.name,
    species: pet.species,
    breed: pet.breed ?? '',
    birthDate: pet.birthDate ?? '',
    passedDate: pet.passedDate ?? '',
    message: pet.message ?? '',
    main: pet.photoUrl && pet.mainUploadId
      ? { key: 'main', uploadId: pet.mainUploadId, url: pet.photoUrl, status: 'existing' }
      : null,
    gallery: (pet.photoUploads ?? []).map((photo, index) => ({
      key: `gallery-${index}-${photo.uploadId}`,
      uploadId: photo.uploadId,
      url: photo.url,
      status: 'existing',
    })),
  };
}

export function moveGalleryPhoto(state: MemorialFormState, index: number, delta: number): MemorialFormState {
  const target = index + delta;
  if (index < 0 || target < 0 || target >= state.gallery.length) return state;
  const gallery = [...state.gallery];
  const [photo] = gallery.splice(index, 1);
  if (!photo) return state;
  gallery.splice(target, 0, photo);
  return { ...state, gallery };
}

export function validateMemorialForm(state: MemorialFormState): string | null {
  if (!state.name.trim()) return 'name_required';
  if (!state.species) return 'species_required';
  if (!state.main) return 'image_required';
  for (const photo of [state.main, ...state.gallery]) {
    if (!photo) continue;
    if (photo.file && !photo.file.type.startsWith('image/')) return 'image_type';
    if (photo.file && photo.file.size > 10 * 1024 * 1024) return 'image_size';
  }
  return null;
}

/** 创建时省略空值；编辑时保留空字符串，明确清除已有日期、品种或寄语 */
export function memorialFormToInput(state: MemorialFormState, forUpdate = false): CreatePetInput {
  return {
    name: state.name.trim(),
    species: state.species,
    breed: forUpdate ? state.breed.trim() : state.breed.trim() || undefined,
    birthDate: forUpdate ? state.birthDate : state.birthDate || undefined,
    passedDate: forUpdate ? state.passedDate : state.passedDate || undefined,
    message: forUpdate ? state.message.trim() : state.message.trim() || undefined,
    mainUploadId: state.main?.uploadId,
    galleryUploadIds: state.gallery.flatMap((photo) => photo.uploadId ? [photo.uploadId] : []),
  };
}
