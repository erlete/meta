import fs from 'node:fs';
import path from 'node:path';
import { stableStringify } from './stable-stringify.mjs';
import RefParser from '@apidevtools/json-schema-ref-parser';

export function writeFile(outPath, contents) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, contents);
}

export function emitRaw(schema, root = 'dist/json') {
  const url = new URL(schema.$id);
  const outPath = path.join(root, url.pathname) + '.json';
  writeFile(outPath, stableStringify(schema));
  return outPath;
}

export async function emitBundled(
  schema,
  root = 'dist/bundled',
  allSchemas = []
) {
  // Create a custom resolver for local schemas
  const localSchemas = {};
  for (const s of allSchemas) {
    if (s.$id) localSchemas[s.$id] = s;
  }

  const options = {
    dereference: { circular: 'ignore' },
    resolve: {
      http: {
        canRead: /^https?:/,
        read(file) {
          // Handle local schema references via HTTP URLs
          const id = file.url;
          if (localSchemas[id]) {
            // Return a deep copy to avoid frozen object issues
            return JSON.stringify(JSON.parse(JSON.stringify(localSchemas[id])));
          }
          throw new Error(`Cannot resolve ${id}`);
        },
      },
    },
  };

  try {
    // Create unfrozen copy for bundling
    const schemaForBundling = JSON.parse(JSON.stringify(schema));
    const bundled = await RefParser.bundle(schemaForBundling, options);
    const url = new URL(schema.$id);
    const outPath = path.join(root, url.pathname) + '.json';
    writeFile(outPath, stableStringify(bundled));
    return outPath;
  } catch (error) {
    // If bundling fails (e.g., unresolvable refs), just emit the raw schema
    console.warn(
      `Warning: Could not bundle ${schema.$id}, error: ${error.message}`
    );
    const url = new URL(schema.$id);
    const outPath = path.join(root, url.pathname) + '.json';
    writeFile(outPath, stableStringify(schema));
    return outPath;
  }
}
