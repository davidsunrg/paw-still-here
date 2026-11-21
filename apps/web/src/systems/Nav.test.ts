import { describe, expect, it } from 'vitest';
import type { Collider } from '../world/World';
import { NavGrid } from './Nav';

function box(minX: number, maxX: number, minZ: number, maxZ: number): Collider {
  return { minX, maxX, minZ, maxZ, tall: false };
}

describe('NavGrid', () => {
  it('goes around an obstacle instead of through it', () => {
    const nav = new NavGrid([box(-1, 1, -1, 1)], { minX: -6, maxX: 6, minZ: -6, maxZ: 6 }, 0.35, 0.5);
    const route = nav.findPath({ x: 0, z: -4 }, { x: 0, z: 4 });
    expect(route).not.toBeNull();
    expect(route!.length).toBeGreaterThan(2);
    expect(route!.some((p) => Math.abs(p.x) > 1.4)).toBe(true);
  });

  it('keeps a clear path as a straight line', () => {
    const nav = new NavGrid([], { minX: -6, maxX: 6, minZ: -6, maxZ: 6 }, 0.35, 0.5);
    expect(nav.findPath({ x: 0, z: -4 }, { x: 0, z: 4 })).toHaveLength(2);
  });

  it('walks to the nearest free spot when the click is inside an obstacle', () => {
    const nav = new NavGrid([box(-1, 1, -1, 1)], { minX: -6, maxX: 6, minZ: -6, maxZ: 6 }, 0.35, 0.5);
    const route = nav.findPath({ x: -4, z: 0 }, { x: 0, z: 0 });
    expect(route).not.toBeNull();
    const end = route!.at(-1)!;
    expect(Math.hypot(end.x, end.z)).toBeGreaterThan(1);
  });
});
