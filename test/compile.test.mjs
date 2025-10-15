import { describe, it, expect } from 'vitest';
import { walkGenerators } from '../src/tools/walk.mjs';
import { ajvFor } from '../src/build/ajv.mjs';

describe('schemas compile and are meta-valid', async () => {
  const gens = await walkGenerators();
  for (const { mod } of gens) {
    const s = mod.schema;
    it(`${s.$id} meta-valid`, () => {
      const ajv = ajvFor(s.$schema);
      const ok = ajv.validateSchema(s);
      if (!ok) throw new Error(ajv.errorsText(ajv.errors, { separator: '\n' }));
      expect(ok).toBe(true);
    });
  }
});
