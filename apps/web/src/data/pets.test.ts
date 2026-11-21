import { afterEach, describe, expect, it } from 'vitest';
import { GALLERY_CAPACITY, placementToSlot, slotToPlacement } from '@paw/shared';
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

describe('floor slots', () => {
  it('maps every floor boundary in both directions', () => {
    expect(GALLERY_CAPACITY).toBe(2052);
    expect(slotToPlacement(0)).toEqual({ floor: 1, section: 'A', cell: 1 });
    expect(slotToPlacement(59)).toEqual({ floor: 1, section: 'A', cell: 60 });
    expect(slotToPlacement(60)).toEqual({ floor: 1, section: 'B', cell: 1 });
    expect(slotToPlacement(125)).toEqual({ floor: 1, section: 'B', cell: 66 });
    expect(slotToPlacement(126)).toEqual({ floor: 1, section: 'C', cell: 1 });
    expect(slotToPlacement(341)).toEqual({ floor: 1, section: 'H', cell: 36 });
    expect(slotToPlacement(342)).toEqual({ floor: 2, section: 'A', cell: 1 });
    expect(slotToPlacement(2051)).toEqual({ floor: 6, section: 'H', cell: 36 });
    expect(placementToSlot(1, 'A', 1)).toBe(0);
    expect(placementToSlot(2, 'A', 1)).toBe(342);
    expect(placementToSlot(2, 'C', 1)).toBe(468);
  });
});
