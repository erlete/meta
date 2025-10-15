import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

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
