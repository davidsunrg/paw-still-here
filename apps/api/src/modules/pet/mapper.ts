import type { PetDto, TributeCounts } from '@paw/shared';
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
  uploadId: string;
  publicUrl: string;
  role: string;
  position: number;
};

export function toPetDto(
  row: PetRow,
  photos: PetPhotoJoined[],
  viewerUserId?: string | null,
  tributes?: TributeCounts,
): PetDto {
  const sorted = [...photos].sort((a, b) => a.position - b.position);
  return {
    id: row.id,
    slot: row.slot,
    name: row.name,
    species: row.species as PetDto['species'],
    breed: row.breed,
    birthDate: row.birthDate,
    passedDate: row.passedDate || null,
    message: row.message || null,
    photos: sorted.map((p) => ({
      id: p.id,
      uploadId: p.uploadId,
      publicUrl: p.publicUrl,
      role: p.role as 'main' | 'gallery',
      position: p.position,
    })),
    tributes: tributes ?? { flower: 0, candle: 0, snack: 0, toy: 0, letter: 0 },
    isReal: true,
    ...(viewerUserId ? { isOwner: row.ownerId === viewerUserId } : {}),
  };
}