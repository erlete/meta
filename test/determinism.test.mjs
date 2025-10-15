import { describe, it, expect } from 'vitest';
import { stableStringify } from '../src/build/stable-stringify.mjs';
import crypto from 'node:crypto';

describe('stable stringify is deterministic', () => {
  it('same hash for object with shuffled keys', () => {
    const a = { b: 1, a: 2, c: { d: 3, a: 1 } };
    const b = { c: { a: 1, d: 3 }, a: 2, b: 1 };
    const h = (x) =>
      crypto.createHash('sha256').update(stableStringify(x)).digest('hex');
    expect(h(a)).toBe(h(b));
  });
});
