import { ajvFor } from './ajv.mjs';
import { deepFreeze } from './freeze.mjs';
import { emitRaw, emitBundled } from './emit.mjs';
import {
  sha256File,
  loadManifest,
  saveManifest,
  assertImmutable,
  upsert,
} from './integrity.mjs';
import { walkGenerators } from '../tools/walk.mjs';
import fs from 'node:fs';

const schemas = await walkGenerators(); // returns array of { path, mod: {schema} }

const manifest = loadManifest();

// Extract all schemas first for bundling
const allSchemas = schemas.map(({ mod }) => mod.schema);

for (const { mod } of schemas) {
  const s = mod.schema;
  if (!s?.$id || !s?.$schema)
    throw new Error(
      `Schema missing $id or $schema: ${JSON.stringify(s?.title)}`
    );
  const ajv = ajvFor(s.$schema);

  // Pre-register core before dependents if needed
  // Walk list twice: first add core/* then others.
  // For simplicity here we rely on walk order; ensure walk sorts by path.

  if (!ajv.validateSchema(s)) {
    throw new Error(ajv.errorsText(ajv.errors, { separator: '\n' }));
  }

  deepFreeze(s);

  const rawPath = emitRaw(s);
  const bunPath = await emitBundled(s, 'dist/bundled', allSchemas);

  const rawHash = sha256File(rawPath);
  const bunHash = sha256File(bunPath);

  // Enforce immutability for released IDs
  assertImmutable(manifest, s.$id, rawHash);

  upsert(manifest, s.$id, {
    id: s.$id,
    schema: s.$schema,
    title: s.title,
    raw: rawPath,
    bundled: bunPath,
    hash: rawHash,
    bundledHash: bunHash,
    size: {
      raw: fs.statSync(rawPath).size,
      bundled: fs.statSync(bunPath).size,
    },
  });
}

saveManifest(manifest);
