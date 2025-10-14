/** @file constants.mjs */

import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const REPO_ROOT = path.join(__dirname, '..', '..', '..', '..')
const SCHEMAS_DIR = path.join(REPO_ROOT, 'src', 'configuration', 'schemas')
const CORE_META_URL = 'https://meta.erlete.dev/core/meta/1.0.0.json'
const VERSIONS_DIR = path.join(REPO_ROOT, 'versions')
const REPO_URL = 'https://github.com/erlete/meta'
const BASE_URL = 'https://meta.erlete.dev'
const METADATA_DEFAULTS = {
  status: 'stable',
  authors: ['Paulo Sánchez (@erlete) <dev.szblzpaulo@gmail.com>'],
  owners: ['Paulo Sánchez (@erlete) <dev.szblzpaulo@gmail.com>'],
  license: 'AGPL-3.0-only',
}
const CORE_AUTHOR_PATH = path.join(
  __dirname,
  '..',
  'schemas',
  'core-author-1.0.0.json'
)

export {
  REPO_ROOT,
  SCHEMAS_DIR,
  CORE_META_URL,
  VERSIONS_DIR,
  REPO_URL,
  BASE_URL,
  METADATA_DEFAULTS,
  CORE_AUTHOR_PATH,
}
