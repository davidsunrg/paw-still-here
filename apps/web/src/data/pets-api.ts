import { FLOOR_CAPACITY, GALLERY_CAPACITY, slotToPlacement, type PetDto } from '@paw/shared';
import type { Pet, Species } from './pets';
import { buildSamplePetAtSlot, replacePets, buildOfflineGallery } from './pets';
import { tributes } from './tributes';

const FUR: Record<Species, string[]> = {
  cat: ['#f0a04b', '#9a9aa2', '#f5f0e6', '#4a4442', '#c9a27a'],
  dog: ['#e0b070', '#f4ede0', '#8a5c3c', '#4a423e', '#d08c4a'],
  rabbit: ['#fbfbf8', '#cfc6bd', '#b08a68'],
  hamster: ['#f1c98d', '#e9e2d6', '#c9a87f'],
  bird: ['#ffd84d', '#8fd0f0', '#9be08f', '#f5f5f5'],
};

export function petFromDto(dto: PetDto): Pet {
  const { section, cell, floor } = slotToPlacement(dto.slot);
  const sorted = [...dto.photos].sort((a, b) => a.position - b.position);
  const main = sorted.find((p) => p.role === 'main');
  const gallery = sorted.filter((p) => p.role === 'gallery');
  const species = dto.species as Species;
  const fur = FUR[species][dto.slot % FUR[species].length]!;
  return {
    id: dto.id,
    slot: dto.slot,
    name: dto.name,
    species,
    breed: dto.breed ?? undefined,
    birthDate: dto.birthDate ?? undefined,
    passedDate: dto.passedDate ?? undefined,
    photoUrl: main?.publicUrl,
    mainUploadId: main?.uploadId,
    photos: gallery.length ? gallery.map((p) => p.publicUrl) : undefined,
    photoUploads: gallery.length ? gallery.map((p) => ({ uploadId: p.uploadId, url: p.publicUrl })) : undefined,
    message: dto.message ?? undefined,
    flowers: 0,
    candles: 0,
    floor,
    section: section as Pet['section'],
    cell,
    fur,
    bg: dto.slot % 6,
    isReal: true,
    canManage: dto.isOwner ?? false,
  };
}

export function applyGalleryFromApi(dtos: PetDto[]): void {
  const realBySlot = new Map(dtos.map((d) => [d.slot, petFromDto(d)]));
  // 第一层铺示例；第二层起默认是空相框，只有真实宠物才占格
  const merged: Array<Pet | undefined> = [];
  for (let slot = 0; slot < GALLERY_CAPACITY; slot++) {
    const real = realBySlot.get(slot);
    if (real) merged[slot] = real;
    else if (slot < FLOOR_CAPACITY) merged[slot] = buildSamplePetAtSlot(slot);
  }
  replacePets(merged);
  tributes.seed(dtos);
}

export function applyOfflineGallery(): void {
  replacePets(buildOfflineGallery());
}