import {
  createPetSchema,
  updatePetSchema,
  type CreatePetInput,
  type PetDto,
  type PresignUploadResult,
  type UpdatePetInput,
} from '@paw/shared';
import { ApiError, apiFetch } from './client';

export async function createMemorialPet(input: CreatePetInput): Promise<PetDto> {
  const body = createPetSchema.parse(input);
  return apiFetch<PetDto>('/api/pets', { method: 'POST', body: JSON.stringify(body) });
}

export async function updateMemorialPet(id: string, input: UpdatePetInput): Promise<PetDto> {
  const body = updatePetSchema.parse(input);
  return apiFetch<PetDto>(`/api/pets/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
}

export async function deleteMemorialPet(id: string): Promise<void> {
  return apiFetch<void>(`/api/pets/${id}`, { method: 'DELETE' });
}

/** 浏览器直传 R2，再让 Worker 确认对象存在；只有完成确认后的 ID 才能关联宠物 */
export async function uploadMemorialImage(file: File): Promise<PresignUploadResult> {
  const presigned = await apiFetch<PresignUploadResult>('/api/uploads/presign', {
    method: 'POST',
    body: JSON.stringify({ originalName: file.name, contentType: file.type }),
  });
  const response = await fetch(presigned.putUrl, {
    method: 'PUT',
    body: file,
    headers: { 'content-type': file.type },
  });
  if (!response.ok) throw new ApiError('upload_failed', response.status);
  await apiFetch(`/api/uploads/${presigned.uploadId}/complete`, { method: 'POST', body: '{}' });
  return presigned;
}
