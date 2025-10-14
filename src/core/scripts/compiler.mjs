/** @file compiler.mjs */

import fs from 'node:fs/promises'
import path from 'node:path'
import { compileOne, nowISO, readJSON, writeJSON } from './functions.mjs'
import { parsedConfig } from '../tools/config-parser.mjs'

const main = async () => {
  const files = (
    await fs.readdir(parsedConfig.dirs.resolvedPaths.schemas)
  ).filter((f) => f.endsWith('.json'))
  const results = []
  for (const f of files)
    results.push(
      await compileOne(path.join(parsedConfig.dirs.resolvedPaths.schemas, f))
    )

  console.log(
    `Compiled ${results.length} schema(s) in ${parsedConfig.dirs.resolvedPaths.schemas}.`
  )

  // Auto-deprecate previous majors
  for (const { name, version, outUrl } of results) {
    const [major] = version.split('.')
    const dir = path.join(parsedConfig.dirs.resolvedPaths.versions, name)
    const entries = (await fs.readdir(dir)).filter(
      (f) => f.endsWith('.json') && f !== `${version}.json`
    )
    for (const file of entries) {
      const v = path.basename(file, '.json')
      const [mOld] = v.split('.')
      if (mOld < major) {
        const p = path.join(dir, file)
        const obj = await readJSON(p)
        if (obj.allOf?.[1]?.$metadata?.status !== 'deprecated') {
          obj.allOf[1].$metadata.status = 'deprecated'
          obj.allOf[1].$metadata.updated = nowISO()
          obj.allOf[1].$metadata.deprecated = {
            since: obj.allOf[1].$metadata.updated,
            reason: 'Deprecated due to new major version release',
            replacedBy: outUrl,
          }
          await writeJSON(p, obj)
        }
      }
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
