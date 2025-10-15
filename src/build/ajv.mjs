/**
 * @file ajv.mjs
 *
 * This module provides shorthands for creating Ajv instances configured for
 * different JSON Schema drafts (2020-12, 2019-09, and 07). It exports a
 * function that takes a draft version string and returns an Ajv instance
 * configured for that draft.
 */

import Ajv2020 from 'ajv/dist/2020.js';
import Ajv2019 from 'ajv/dist/2019.js';
import Ajv07 from 'ajv';
import addFormats from 'ajv-formats';

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
const ajvConstructor = (Ctor) => {
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
  if (draft?.includes('2020-12')) return ajvConstructor(Ajv2020);
  if (draft?.includes('2019-09')) return ajvConstructor(Ajv2019);

  return ajvConstructor(Ajv07);
};
