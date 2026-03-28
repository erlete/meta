import fs from 'node:fs';
import crypto from 'node:crypto';

// region Helpers

/**
 * Deeply freezes an object to prevent any modifications.
 * Essential for ensuring schema integrity after validation.
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

// === HASHING & FILE OPERATIONS ===

export function sha256File(p) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(p));
  return `sha256-${hash.digest('base64')}`;
}

// === MANIFEST OPERATIONS ===

export function loadManifest(p = 'dist/manifest.json') {
  if (!fs.existsSync(p)) return { schemas: {} };
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

export function saveManifest(m, p = 'dist/manifest.json') {
  fs.writeFileSync(p, JSON.stringify(m, null, 2) + '\n');
}

export function assertImmutable(manifest, id, newHash) {
  const prev = manifest.schemas[id];
  if (!prev) return;
  if (prev.hash !== newHash) {
    throw new Error(
      `IMMUTABILITY VIOLATION: ${id} content changed. Was ${prev.hash}, now ${newHash}`
    );
  }
}

export function upsert(manifest, id, entry) {
  manifest.schemas[id] = entry;
}
