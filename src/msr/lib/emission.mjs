/**
 * @file emit.mjs
 *
 * This module provides functions to emit JSON Schemas to the filesystem,
 * either as raw schemas or bundled schemas with all references resolved.
 * It includes stable stringification for deterministic JSON output and
 * uses the `@apidevtools/json-schema-ref-parser` library to handle
 * schema bundling and ensures that emitted files are stored in the correct
 * directory structure based on their `$id` URLs.
 */

import fs from 'node:fs';
import path from 'node:path';
import RefParser from '@apidevtools/json-schema-ref-parser';

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
