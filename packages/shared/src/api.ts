import type { PetDto } from './schemas';

export interface Health {
  ok: true;
  time: number;
}

export interface ApiErrorBody {
  error: string;
}

export interface PresignUploadResult {
  uploadId: string;
  putUrl: string;
  publicUrl: string;
}

export interface CompleteUploadResult {
  uploadId: string;
  publicUrl: string;
  status: 'completed';
}

export type { CreatePetInput, UpdatePetInput, PresignUploadInput, PetDto, PetPhotoDto } from './schemas';
export {
  createPetSchema,
  updatePetSchema,
  presignUploadSchema,
  petDtoSchema,
} from './schemas';