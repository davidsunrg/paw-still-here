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
  give: vi.fn(),
  summary: vi.fn(),
  writeLetter: vi.fn(),
  removeLetter: vi.fn(),
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
    tributeService: {
      give: mocks.give,
      summary: mocks.summary,
      writeLetter: mocks.writeLetter,
      removeLetter: mocks.removeLetter,
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
    tributes: { flower: 0, candle: 0, snack: 0, toy: 0, letter: 0 },
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

describe('Hono tribute HTTP API', () => {
  const post = (path: string, body: unknown) =>
    app.fetch(new Request(`http://test/api/pets/${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }), {} as never);

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.userId = null;
    mocks.summary.mockResolvedValue({ counts: {}, gifts: {}, letters: [], fresh: null });
    mocks.give.mockResolvedValue({ kind: 'flower', variant: 1 });
    mocks.writeLetter.mockResolvedValue({ id: 'l1', text: 'hi', createdAt: 1, mine: true });
    mocks.removeLetter.mockResolvedValue(undefined);
  });

  it('reads tributes publicly and passes a valid since through', async () => {
    const plain = await app.fetch(new Request('http://test/api/pets/pet-1/tributes'), {} as never);
    expect(plain.status).toBe(200);
    expect(mocks.summary).toHaveBeenCalledWith('pet-1', null, undefined);
    await app.fetch(new Request('http://test/api/pets/pet-1/tributes?since=1700'), {} as never);
    expect(mocks.summary).toHaveBeenLastCalledWith('pet-1', null, 1700);
    await app.fetch(new Request('http://test/api/pets/pet-1/tributes?since=abc'), {} as never);
    expect(mocks.summary).toHaveBeenLastCalledWith('pet-1', null, undefined);
  });

  it('requires a session and a known kind to leave a gift', async () => {
    expect((await post('pet-1/tributes', { kind: 'flower' })).status).toBe(401);
    mocks.userId = 'visitor';
    expect((await post('pet-1/tributes', { kind: 'rocket' })).status).toBe(400);
    expect(mocks.give).not.toHaveBeenCalled();
    const ok = await post('pet-1/tributes', { kind: 'candle' });
    expect(ok.status).toBe(201);
    expect(mocks.give).toHaveBeenCalledWith('visitor', 'pet-1', 'candle');
  });

  it('maps a second gift on the same day to 409 already_today', async () => {
    mocks.userId = 'visitor';
    mocks.give.mockImplementation(async () => { throw err.conflict('already_today'); });
    const response = await post('pet-1/tributes', { kind: 'flower' });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'already_today' });
  });

  it('validates letters and lets a signed-in visitor write and remove one', async () => {
    expect((await post('pet-1/letters', { text: 'hello' })).status).toBe(401);
    mocks.userId = 'visitor';
    expect((await post('pet-1/letters', { text: '   ' })).status).toBe(400);
    expect((await post('pet-1/letters', { text: 'x'.repeat(301) })).status).toBe(400);
    expect((await post('pet-1/letters', { text: ' hello ' })).status).toBe(201);
    expect(mocks.writeLetter).toHaveBeenCalledWith('visitor', 'pet-1', 'hello');
    const removed = await app.fetch(new Request('http://test/api/pets/pet-1/letters/l1', { method: 'DELETE' }), {} as never);
    expect(removed.status).toBe(204);
    expect(mocks.removeLetter).toHaveBeenCalledWith('visitor', 'pet-1', 'l1');
  });
});
