/** @file functions.mjs */

import fs from 'node:fs/promises'
import nodePath from 'node:path'
import crypto from 'node:crypto'
import { CORE_META_URL, METADATA_DEFAULTS } from './constants.mjs'
import { execFileSync } from 'node:child_process'
import addFormats from 'ajv-formats'
import Ajv2020 from 'ajv/dist/2020.js'
import { parsedConfig } from '../tools/config-parser.mjs'

const ajv = new Ajv2020({ strict: true, strictSchema: true, allErrors: true })
addFormats(ajv)

const coreAuthorSchema = JSON.parse(
  await fs.readFile(
    nodePath.join(
      parsedConfig.dirs.resolvedPaths.coreSchemas,
      'core-author-1.0.0.json'
    ),
    'utf8'
  )
)

const validateAuthor = ajv.compile(coreAuthorSchema)

function formatErrors(errors = []) {
  return errors
    .map((e) => {
      const path = e.instancePath || '/'
      const msg = e.message || 'invalid'
      const params = e.params ? ` ${JSON.stringify(e.params)}` : ''
      return ` - ${path}: ${msg}${params}`
    })
    .join('\n')
}

/**
 * Generate a UTC ISO8601 timestamp without milliseconds.
 *
 * @returns {string} The current timestamp in ISO8601 format (e.g., "2024-06-01T12:00:00Z").
 */
function nowISO() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
}

/**
 * Get the current Git commit hash (shortened to 12 characters).
 *
 * @async
 * @returns {Promise<string>} The short Git commit hash (12 characters).
 */
const commitSHA12 = async () => {
  // Pre-check for CI overrides:
  if (process.env.GIT_COMMIT) return String(process.env.GIT_COMMIT).slice(0, 12)

  // Git HEAD reference:
  try {
    const sha = execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], {
      cwd: parsedConfig.dirs.base,
      encoding: 'utf8',
    }).trim()

    if (/^[0-9a-f]{7,12}$/i.test(sha)) return sha.toLowerCase()
  } catch (error) {
    console.warning('Warning: Unable to get git commit SHA:', error)
  }

  // Errorless fallback:
  return 'unknown'
}

/**
 * Read a JSON file and parse its contents.
 *
 * @async
 * @param {string} path - The path to the JSON file.
 * @returns {Promise<Object>} The parsed JSON object.
 */
async function readJSON(path) {
  return JSON.parse(await fs.readFile(path, 'utf8'))
}

/**
 * Write a JSON object to a file.
 *
 * @async
 * @param {string} path - The path to the output JSON file.
 * @param {Object} obj - The JSON object to write.
 * @returns {Promise<string>} The JSON string that was written to the file.
 */
async function writeJSON(path, obj) {
  const json = JSON.stringify(obj, null, 2) + '\n'
  await fs.mkdir(nodePath.dirname(path), { recursive: true })
  await fs.writeFile(path, json, 'utf8')
  return json
}

/**
 * Compile a source JSON schema file into a versioned schema file.
 *
 * This function reads the source file, validates it, and writes the compiled schema
 * to the appropriate output directory.
 *
 * @async
 * @param {string} srcFile - The path to the source JSON schema file.
 * @returns {Promise<{ name: string, version: string, outFile: string, outUrl: string, checksum: string }>} An object containing details about the compiled schema.
 * @throws {Error} If the output file already exists (to ensure immutability).
 */
async function compileOne(srcFile) {
  const src = await readJSON(srcFile)

  if (!validateAuthor(src)) {
    const details = formatErrors(validateAuthor.errors)
    throw new Error(`Authoring schema invalid: ${srcFile}\n${details}`)
  }
  // TODO: Review this code.
  // Validate against core-author here if you integrate a validator.

  const {
    name,
    version,
    title,
    description,
    draft = 'https://json-schema.org/draft/2020-12/schema',
  } = src
  const outDir = nodePath.join(parsedConfig.dirs.resolvedPaths.versions, name)
  const outFile = nodePath.join(outDir, `${version}.json`)
  const outUrl = `${parsedConfig.urls.resolvedPaths.versions}/${encodeURIComponent(name)}/${version}.json`

  // Immutability:
  try {
    await fs.access(outFile)
    throw new Error(`Refusing to overwrite ${outFile}`)
  } catch {}

  const compiled = {
    $schema: draft,
    allOf: [
      { $ref: CORE_META_URL },
      {
        $id: outUrl,
        title: title,
        description: description,
        ...src.domain,
        $metadata: {
          name: name,
          version: version,
          status: src.status ?? METADATA_DEFAULTS.status,
          authors: src.authors ?? METADATA_DEFAULTS.authors,
          owners: src.owners ?? METADATA_DEFAULTS.owners,
          source: src.source,
          license: src.license ?? METADATA_DEFAULTS.license,
          created: '__GENERATED_ISO_UTC__',
          updated: '__GENERATED_ISO_UTC__',
          checksum: '__GENERATED_SHA256_HEX__',
          repo: {
            url: parsedConfig.metadata.repositoryUrl,
            path: `versions/${name}/${version}.json`,
            commit: '__GENERATED_COMMIT12__',
          },
        },
      },
    ],
  }

  // Fill generated fields:
  const created = nowISO()
  compiled.allOf[1].$metadata.created = created
  compiled.allOf[1].$metadata.updated = created

  compiled.allOf[1].$metadata.repo.commit = await commitSHA12()

  const checksum = crypto
    .createHash('sha256')
    .update(JSON.stringify(compiled, null, 2) + '\n', 'utf8')
    .digest('hex')
  compiled.allOf[1].$metadata.checksum = checksum

  // Write final data:
  await writeJSON(outFile, compiled)
  await writeJSON(nodePath.join(outDir, 'current.json'), {
    $ref: `./${version}.json`,
  })

  return { name, version, outFile, outUrl, checksum }
}

export { nowISO, commitSHA12, readJSON, writeJSON, compileOne }
