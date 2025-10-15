import fs from 'node:fs';
import crypto from 'node:crypto';

export function sha256File(p) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(p));
  return `sha256-${hash.digest('base64')}`;
}

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
