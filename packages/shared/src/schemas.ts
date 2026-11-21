import { z } from 'zod';
import { PHOTO_ROLE, SPECIES } from './constants';

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD')
  .optional();

export const createPetSchema = z.object({
  name: z.string().trim().min(1).max(80),
  species: z.enum(SPECIES),
  breed: z.string().trim().max(80).optional(),
  birthDate: isoDate,
  passedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD'),
  message: z.string().trim().min(1).max(2000),
  mainUploadId: z.string().uuid().optional(),
  galleryUploadIds: z.array(z.string().uuid()).max(24).optional(),
});

export const updatePetSchema = createPetSchema
  .partial()
  .extend({
    galleryUploadIds: z.array(z.string().uuid()).max(24).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'empty update' });

export const presignUploadSchema = z.object({
  originalName: z.string().trim().min(1).max(255),
  contentType: z.string().trim().min(3).max(127),
});

export const petPhotoDtoSchema = z.object({
  id: z.string().uuid(),
  publicUrl: z.string().url(),
  role: z.enum(PHOTO_ROLE),
  position: z.number().int().nonnegative(),
});

export const petDtoSchema = z.object({
  id: z.string().uuid(),
  slot: z.number().int().min(0).max(99),
  name: z.string(),
  species: z.enum(SPECIES),
  breed: z.string().nullable(),
  birthDate: z.string().nullable(),
  passedDate: z.string(),
  message: z.string(),
  photos: z.array(petPhotoDtoSchema),
  isOwner: z.boolean().optional(),
  isReal: z.literal(true),
});

export type CreatePetInput = z.infer<typeof createPetSchema>;
export type UpdatePetInput = z.infer<typeof updatePetSchema>;
export type PresignUploadInput = z.infer<typeof presignUploadSchema>;
export type PetPhotoDto = z.infer<typeof petPhotoDtoSchema>;
export type PetDto = z.infer<typeof petDtoSchema>;