import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PetDto } from '@paw/shared';
import { tributes } from './tributes';

function dto(id: string, flower = 0): PetDto {
  return {
    id,
    slot: 0,
    name: 'Real pet',
    species: 'cat',
    breed: null,
    birthDate: null,
    passedDate: null,
    message: null,
    photos: [],
    tributes: { flower, candle: 0, snack: 0, toy: 0, letter: 0 },
    isReal: true,
  };
}

function respond(status: number, body: unknown) {
  return new Response(body === null ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('tributes cache', () => {
  const fetchMock = vi.fn();
  beforeEach(() => vi.stubGlobal('fetch', fetchMock));
  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('shows as many gifts as the wall count before details are loaded', () => {
    tributes.seed([dto('seeded', 7)]);
    expect(tributes.counts('seeded').flower).toBe(7);
    expect(tributes.gifts('seeded').flower).toHaveLength(7);
  });

  it('counts a gift at once and keeps the variant the server chose', async () => {
    tributes.seed([dto('ok', 1)]);
    fetchMock.mockResolvedValueOnce(respond(201, { kind: 'flower', variant: 4 }));
    const { saved } = tributes.give('ok', 'flower');
    expect(tributes.counts('ok').flower).toBe(2);
    await saved;
    expect(tributes.counts('ok').flower).toBe(2);
    expect(tributes.gifts('ok').flower.at(-1)).toBe(4);
  });

  it('takes the gift back when the server says it was already left today', async () => {
    tributes.seed([dto('twice', 1)]);
    fetchMock.mockResolvedValueOnce(respond(409, { error: 'already_today' }));
    const { saved } = tributes.give('twice', 'flower');
    expect(tributes.counts('twice').flower).toBe(2);
    await expect(saved).rejects.toMatchObject({ code: 'already_today', status: 409 });
    expect(tributes.counts('twice').flower).toBe(1);
    expect(tributes.gifts('twice').flower).toHaveLength(1);
  });

  it('puts a new letter first, then swaps in the saved one or removes it on failure', async () => {
    tributes.seed([dto('letters')]);
    fetchMock.mockResolvedValueOnce(respond(201, { id: 'l1', text: 'hello', createdAt: 5, mine: true }));
    const first = tributes.write('letters', 'hello');
    expect(tributes.isDraft(tributes.letters('letters')[0]!.id)).toBe(true);
    await first.saved;
    expect(tributes.letters('letters').map((l) => l.id)).toEqual(['l1']);

    fetchMock.mockResolvedValueOnce(respond(409, { error: 'letter_limit' }));
    const second = tributes.write('letters', 'again');
    expect(tributes.counts('letters').letter).toBe(2);
    await expect(second.saved).rejects.toMatchObject({ code: 'letter_limit' });
    expect(tributes.counts('letters').letter).toBe(1);
    expect(tributes.letters('letters').map((l) => l.id)).toEqual(['l1']);
  });

  it('replaces counts, gifts and letters with the loaded details and returns what is new', async () => {
    tributes.seed([dto('detail', 9)]);
    fetchMock.mockResolvedValueOnce(
      respond(200, {
        counts: { flower: 2, candle: 1, snack: 0, toy: 0, letter: 1 },
        gifts: { flower: [3, 1], candle: [0], snack: [], toy: [] },
        letters: [{ id: 'l9', text: 'hi', createdAt: 1, mine: false }],
        fresh: { flower: 1, candle: 0, snack: 0, toy: 0, letter: 1 },
      }),
    );
    const fresh = await tributes.load('detail', 1234);
    expect(String(fetchMock.mock.calls[0]![0])).toBe('/api/pets/detail/tributes?since=1234');
    expect(fresh).toMatchObject({ flower: 1, letter: 1 });
    expect(tributes.gifts('detail').flower).toEqual([3, 1]);
    expect(tributes.letters('detail')).toHaveLength(1);
  });
});
