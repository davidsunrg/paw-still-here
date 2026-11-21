import type { PetDto } from '@paw/shared';
export type PetRow = {
  id: string;
  ownerId: string;
  slot: number;
  name: string;
  species: string;
  breed: string | null;
  birthDate: string | null;
  passedDate: string;
  message: string;
  createdAt: Date;
  updatedAt: Date;
};

export type PetPhotoJoined = {
  id: string;
  publicUrl: string;
  role: string;
  position: number;
};

export function toPetDto(
  row: PetRow,
  photos: PetPhotoJoined[],
  viewerUserId?: string | null,
): PetDto {
  const sorted = [...photos].sort((a, b) => a.position - b.position);
  return {
    id: row.id,
    slot: row.slot,
    name: row.name,
    species: row.species as PetDto['species'],
    breed: row.breed,
    birthDate: row.birthDate,
    passedDate: row.passedDate,
    message: row.message,
    photos: sorted.map((p) => ({
      id: p.id,
      publicUrl: p.publicUrl,
      role: p.role as 'main' | 'gallery',
      position: p.position,
    })),
    isReal: true,
    ...(viewerUserId ? { isOwner: row.ownerId === viewerUserId } : {}),
  };
}