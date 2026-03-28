import fs from 'node:fs';
import path from 'node:path';
import RefParser from '@apidevtools/json-schema-ref-parser';
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

// region Helpers

/**
 * Converts a value to a stable JSON string with sorted object keys.
 * This ensures deterministic output for consistent hashing and comparison.
 *
 * @param {*} value - The value to stringify.
 * @returns {string} The stable JSON string representation.
 */
export function stableStringify(value) {
  const seen = new WeakSet();
  const sorter = (obj) => {
    if (obj === null || typeof obj !== 'object') return obj;
    if (seen.has(obj)) throw new Error('circular');
    seen.add(obj);
    if (Array.isArray(obj)) return obj.map(sorter);
    return Object.fromEntries(
      Object.keys(obj)
        .sort()
        .map((k) => [k, sorter(obj[k])])
    );
  };
  return JSON.stringify(sorter(value), null, 2) + '\n';
}

/**
 * Writes contents to a file, creating directories as needed.
 *
 * @export
 * @param {string} outPath - The output file path.
 * @param {string} contents - The contents to write to the file.
 */
export function writeFile(outPath, contents) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, contents);
}

// region Other

/**
 * Emits a raw JSON Schema to the filesystem.
 *
 * @param {object} schema - The JSON Schema object to emit.
 * @param {string} [root='dist/json'] - The root directory for emitted schemas.
 * @returns {string} The path to the emitted schema file.
 */
export function emitRaw(schema, root = 'dist/json') {
  const url = new URL(schema.$id);
  const outPath = path.join(root, url.pathname) + '.json';

  writeFile(outPath, stableStringify(schema));
  return outPath;
}

/**
 * Emits a bundled JSON Schema to the filesystem, resolving all references.
 *
 * If bundling fails, emits the raw schema instead.
 *
 * @param {object} schema - The JSON Schema object to emit.
 * @param {string} [root='dist/bundled'] - The root directory for emitted schemas.
 * @param {object[]} [allSchemas=[]] - An array of all available schemas for reference resolution.
 * @returns {Promise<string>} A promise that resolves to the path of the emitted schema file.
 */
export async function emitBundled(
  schema,
  root = 'dist/bundled',
  allSchemas = []
) {
  // Schema lookup by $id for local resolution:
  const localSchemas = {};
  for (const s of allSchemas) {
    if (s.$id) localSchemas[s.$id] = s;
  }

  try {
    // Create unfrozen copy for bundling:
    const schemaForBundling = JSON.parse(JSON.stringify(schema));
    const bundled = await RefParser.bundle(schemaForBundling, {
      dereference: { circular: 'ignore' },
      resolve: {
        http: {
          canRead: /^https?:/,
          read(file) {
            // Handle local schema references via HTTP URLs:
            const id = file.url;

            if (localSchemas[id]) {
              // Return a deep copy to avoid frozen object issues:
              return JSON.stringify(
                JSON.parse(JSON.stringify(localSchemas[id]))
              );
            }

            throw new Error(`Cannot resolve ${id}`);
          },
        },
      },
    });

    const url = new URL(schema.$id);
    const outPath = path.join(root, url.pathname) + '.json';

    writeFile(outPath, stableStringify(bundled));
    return outPath;
  } catch (error) {
    // If bundling fails, emit the raw schema:
    console.warn(
      `Warning: Could not bundle ${schema.$id}, error: ${error.message}`
    );

    return emitRaw(schema, root);
  }
}

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
