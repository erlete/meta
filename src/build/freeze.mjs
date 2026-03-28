/**
 * @file freeze.mjs
 *
 * This module provides the necessary tools to freeze JSON Schema objects,
 * which makes them immutable. This becomes essential in build processes to
 * ensure that schema definitions are not inadvertently modified after their
 * initial creation and validation.
 */

/**
 * Deeply freezes an object.
 *
 * @param {object} o - The object to freeze.
 * @returns {object} The deeply frozen object.
 */
export function deepFreeze(o) {
  Object.freeze(o);

  for (const k of Object.keys(o)) {
    const v = o[k];
    if (v && typeof v === 'object' && !Object.isFrozen(v)) deepFreeze(v);
  }

  return o;
}
