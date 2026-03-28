/**
 * @file discovery.mjs
 *
 * This module provides discovery capabilities for schema generators
 * and validation tools. It finds .gen.mjs files in the file system
 * and creates appropriate Ajv validators for different JSON Schema drafts.
 */

import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import Ajv2019 from 'ajv/dist/2019.js';
import Ajv07 from 'ajv';
import addFormats from 'ajv-formats';

// region Generators

/**
 * Walks the file system to find schema generator modules.
 *
 * @export
 * @async
 * @param {string} [root='src/schemas'] - The root directory to start the search.
 * @returns {Promise<Array<{path: string, mod: any}>>} A promise that resolves to an array of objects containing the file path and imported module.
 */
export async function walkGenerators(root = 'src/schemas') {
  const out = [];
  function walk(dir) {
    for (const e of readdirSync(dir)) {
      const p = path.join(dir, e);
      const st = statSync(p);
      if (st.isDirectory()) walk(p);
      else if (e.endsWith('.gen.mjs')) out.push(p);
    }
  }

  walk(root);
  out.sort(); // ensure deterministic order (core/* first by structure)

  const mods = [];
  for (const p of out) {
    const fullPath = path.resolve(p);
    const fileUrl = `file://${fullPath.replace(/\\/g, '/')}`;
    mods.push({ path: p, mod: await import(fileUrl) });
  }

  return mods;
}

// region Schemas

/**
 * Ajv constructor with formats addition.
 *
 * This function creates an instance of Ajv with the provided constructor,
 * enabling strict mode, all errors reporting, union types, and ESM code
 * generation.
 *
 * @param {*} Ctor - The Ajv constructor to use (e.g., Ajv2020, Ajv2019, Ajv07).
 * @returns {ajv} An instance of Ajv with the specified configuration.
 */
const ajvCtor = (Ctor) => {
  const ajv = new Ctor({
    strict: true,
    allErrors: true,
    allowUnionTypes: true,
    code: { esm: true },
  });
  addFormats(ajv);

  return ajv;
};

/**
 * Ajv constructor selector.
 *
 * This function selects the appropriate Ajv constructor based on the provided
 * draft version string. It supports draft-2020-12, draft-2019-09, and defaults
 * to draft-07 if no specific draft is matched.
 *
 * @param {string} draft - The draft version string (e.g., 'https://json-schema.org/draft/2020-12/schema').
 * @returns {ajv} An instance of Ajv configured for the specified draft version.
 */
export const ajvFor = (draft) => {
  if (draft?.includes('2020-12')) return ajvCtor(Ajv2020);
  if (draft?.includes('2019-09')) return ajvCtor(Ajv2019);
  return ajvCtor(Ajv07);
};
