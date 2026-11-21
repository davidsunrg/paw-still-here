import { createPetSchema, type CreatePetInput } from '@paw/shared';
import { apiFetch } from './client';

export async function createMemorialPet(input: CreatePetInput) {
  const body = createPetSchema.parse(input);
  return apiFetch('/api/pets', { method: 'POST', body: JSON.stringify(body) });
}