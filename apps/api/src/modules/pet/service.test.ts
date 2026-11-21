import { describe, expect, it } from 'vitest';
import { createPetService } from './service';

describe('pet slot allocation', () => {
  const service = createPetService(
    { listSlots: async () => [0, 2] } as never,
    {} as never,
  );

  it('picks smallest free slot', () => {
    expect(service.findFreeSlot([0, 2])).toBe(1);
    expect(service.findFreeSlot([0, 1, 2])).toBe(3);
  });

  it('returns null when gallery full', () => {
    const all = Array.from({ length: 100 }, (_, i) => i);
    expect(service.findFreeSlot(all)).toBeNull();
  });
});