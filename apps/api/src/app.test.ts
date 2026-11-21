import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PetDto } from '@paw/shared';
import { err } from './lib/errors';

const mocks = vi.hoisted(() => ({
  userId: null as string | null,
  list: vi.fn(),
  get: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}));

vi.mock('./lib/deps', () => ({
  createRequestDeps: () => ({
    auth: {
      api: {
        getSession: async () => mocks.userId ? { user: { id: mocks.userId }, session: { token: 'test' } } : null,
      },
    },
    petService: {
      list: mocks.list,
      get: mocks.get,
      create: mocks.create,
      update: mocks.update,
      remove: mocks.remove,
    },
    uploadService: {},
  }),
}));

import app from './app';

function dto(): PetDto {
  return {
    id: crypto.randomUUID(),
    slot: 0,
    name: 'Public pet',
    species: 'dog',
    breed: null,
    birthDate: null,
    passedDate: null,
    message: null,
    photos: [],
    isReal: true,
  };
}

describe('Hono pet HTTP API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.userId = null;
    mocks.list.mockResolvedValue([dto()]);
    mocks.get.mockResolvedValue(dto());
    mocks.create.mockImplementation(async () => dto());
    mocks.update.mockImplementation(async () => dto());
    mocks.remove.mockResolvedValue(undefined);
  });

  it('allows public list and detail reads without a session', async () => {
    const list = await app.fetch(new Request('http://test/api/pets'), {} as never);
    expect(list.status).toBe(200);
    expect(mocks.list).toHaveBeenCalledWith(null);
    const detail = await app.fetch(new Request('http://test/api/pets/some-id'), {} as never);
    expect(detail.status).toBe(200);
  });

  it('rejects creation without a session', async () => {
    const response = await app.fetch(new Request('http://test/api/pets', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'No session', species: 'dog' }),
    }), {} as never);
    expect(response.status).toBe(401);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('accepts a minimal creation from the anonymous owner', async () => {
    mocks.userId = 'owner';
    const response = await app.fetch(new Request('http://test/api/pets', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Minimal', species: 'cat' }),
    }), {} as never);
    expect(response.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith('owner', { name: 'Minimal', species: 'cat' });
  });

  it('maps non-owner updates to 403 and keeps owner deletion working', async () => {
    mocks.userId = 'other-user';
    mocks.update.mockImplementation(async () => { throw err.forbidden(); });
    const forbidden = await app.fetch(new Request('http://test/api/pets/pet-1', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Not yours' }),
    }), {} as never);
    expect(forbidden.status).toBe(403);

    mocks.userId = 'owner';
    const deleted = await app.fetch(new Request('http://test/api/pets/pet-1', { method: 'DELETE' }), {} as never);
    expect(deleted.status).toBe(204);
    expect(mocks.remove).toHaveBeenCalledWith('owner', 'pet-1');
  });
});
