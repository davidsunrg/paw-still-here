import { afterEach, describe, expect, it } from 'vitest';
import { PETS, petById, replacePets, replaceSlotPet } from './pets';

const original = [...PETS];

afterEach(() => replacePets(original));

describe('replaceSlotPet', () => {
  it('swaps one slot and keeps petById in sync', () => {
    const old = PETS[0]!;
    const pet = { ...old, id: 'new-pet', name: 'New name' };
    expect(replaceSlotPet(0, pet)).toBe(old);
    expect(PETS[0]).toBe(pet);
    expect(petById.get('new-pet')).toBe(pet);
    expect(petById.has(old.id)).toBe(false);
  });

  it('returns undefined for a slot that does not exist', () => {
    expect(replaceSlotPet(PETS.length + 5, PETS[0]!)).toBeUndefined();
  });
});
