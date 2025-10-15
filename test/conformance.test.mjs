import { describe, it, expect } from 'vitest';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { walkGenerators } from '../src/tools/walk.mjs';

const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);

const fixtures = {
  'https://meta.erlete.dev/core/1.0.0': {
    valid: [
      {
        name: 'pkg',
        version: '1.2.3',
        title: 't',
        description: 'd',
        domain: { x: {} },
      },
    ],
    invalid: [{}, { name: 'x', version: '1', title: '', description: '' }],
  },
};

describe('fixtures', async () => {
  const gens = await walkGenerators();
  for (const { mod } of gens) {
    const s = mod.schema;
    ajv.addSchema(s);
    const f = fixtures[s.$id];
    if (!f) continue;
    const validate = ajv.getSchema(s.$id);
    for (const v of f.valid)
      it(`${s.$id} accepts valid`, () => expect(validate(v)).toBe(true));
    for (const v of f.invalid)
      it(`${s.$id} rejects invalid`, () => expect(validate(v)).toBe(false));
  }
});
