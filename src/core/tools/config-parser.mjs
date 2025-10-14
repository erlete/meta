import { config } from '../../../meta.config.mjs'

import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const baseDir = config.dirs.base ?? path.join(__dirname, '..', '..', '..')

export const parsedConfig = {
  dirs: {
    base: baseDir,
    resolvedPaths: {
      coreSchemas: path.join(baseDir, config.dirs.paths.coreSchemas),
      schemas: path.join(baseDir, config.dirs.paths.schemas),
      versions: path.join(baseDir, config.dirs.paths.versions),
    },
  },
  urls: {
    base: config.urls.base,
    resolvedPaths: {
      core: new URL('/core', config.urls.base).href,
      versions: new URL('/versions', config.urls.base).href,
    },
  },
  metadata: config.metadata,
}

console.log('Parsed Configuration:', parsedConfig)
