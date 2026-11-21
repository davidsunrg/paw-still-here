import { z } from 'zod';
import { LETTER_MAX, PHOTO_ROLE, SPECIES, TRIBUTE_KINDS } from './constants';

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD')
  .or(z.literal(''))
  .optional();

export const createPetSchema = z.object({
  name: z.string().trim().min(1).max(80),
  species: z.enum(SPECIES),
  breed: z.string().trim().max(80).optional(),
  birthDate: isoDate,
  passedDate: isoDate,
  message: z.string().trim().max(2000).optional(),
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
  uploadId: z.string().uuid(),
  publicUrl: z.string().url(),
  role: z.enum(PHOTO_ROLE),
  position: z.number().int().nonnegative(),
});

const count = z.number().int().nonnegative();

/** 一只宠物收到的礼物和信各有多少 */
export const tributeCountsSchema = z.object({
  flower: count,
  candle: count,
  snack: count,
  toy: count,
  letter: count,
});

export const createTributeSchema = z.object({ kind: z.enum(TRIBUTE_KINDS) });
export const createLetterSchema = z.object({ text: z.string().trim().min(1).max(LETTER_MAX) });

export const tributeDtoSchema = z.object({
  kind: z.enum(TRIBUTE_KINDS),
  variant: count,
});

export const letterDtoSchema = z.object({
  id: z.string().uuid(),
  text: z.string(),
  createdAt: z.number(),
  /** 是不是当前访客写的 */
  mine: z.boolean(),
});

/** 进入纪念角时读的详情：总数、每种礼物最近若干件的外观（旧的在前）、最近的信（新的在前） */
export const petTributesDtoSchema = z.object({
  counts: tributeCountsSchema,
  gifts: z.object({
    flower: z.array(count),
    candle: z.array(count),
    snack: z.array(count),
    toy: z.array(count),
  }),
  letters: z.array(letterDtoSchema),
  /** 带了 since 才有：那之后别人留下的数量 */
  fresh: tributeCountsSchema.nullable(),
});

export const petDtoSchema = z.object({
  id: z.string().uuid(),
  slot: z.number().int().min(0).max(99),
  name: z.string(),
  species: z.enum(SPECIES),
  breed: z.string().nullable(),
  birthDate: z.string().nullable(),
  passedDate: z.string().nullable(),
  message: z.string().nullable(),
  photos: z.array(petPhotoDtoSchema),
  tributes: tributeCountsSchema,
  isOwner: z.boolean().optional(),
  isReal: z.literal(true),
});

export type CreatePetInput = z.infer<typeof createPetSchema>;
export type UpdatePetInput = z.infer<typeof updatePetSchema>;
export type PresignUploadInput = z.infer<typeof presignUploadSchema>;
export type PetPhotoDto = z.infer<typeof petPhotoDtoSchema>;
export type PetDto = z.infer<typeof petDtoSchema>;
export type TributeCounts = z.infer<typeof tributeCountsSchema>;
export type CreateTributeInput = z.infer<typeof createTributeSchema>;
export type CreateLetterInput = z.infer<typeof createLetterSchema>;
export type TributeDto = z.infer<typeof tributeDtoSchema>;
export type LetterDto = z.infer<typeof letterDtoSchema>;
export type PetTributesDto = z.infer<typeof petTributesDtoSchema>;