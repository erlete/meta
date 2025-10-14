#!/usr/bin/env node
const { Command } = require('commander')
const path = require('path')
const fs = require('fs')
const { getAbsolutePath } = require('./utils/dir')
const program = new Command()
const asciiTable = require('ascii-table')
const Ajv = require('ajv')
const addFormats = require('ajv-formats')

// region Constants

const CONFIG_SCHEMAS_PATH = path.join(__dirname, 'configuration', 'schemas')

// region CLI

program
  .version('1.0.0')
  .description('A well-documented commander.js base program')
  .option('--dry-run', 'enable dry run mode')
  .option('--debug', 'enable debug mode')
  .option('--verbose', 'enable verbose mode')
  .option(
    '-d, --dir <directory>',
    'directory to run command at (relative or absolute)',
    process.cwd()
  )

// Global pre-action hook that runs for every command (including subcommands)
program.hook('preAction', (thisCommand) => {
  const opts = thisCommand.opts()

  if (opts.debug) {
    console.log('Debug mode is enabled.')
  }
  if (opts.verbose) {
    console.log('Verbose mode is enabled.')
  }
  if (opts.dryRun) {
    console.log('Dry run mode is enabled (global).')
  }

  const resolvedDir = getAbsolutePath(opts.dir, { forceDirectory: true })
  if (!resolvedDir) {
    console.error(
      `Error: The specified directory "${opts.dir}" does not exist or is not a directory.`
    )
    process.exit(1)
  }
  thisCommand.setOptionValue('dir', resolvedDir)
  console.log(`Using directory: ${resolvedDir}`)
})

// region Generate
program
  .command('generate')
  .alias('gen')
  .alias('g')
  .description('Run the generate command with options')
  .action((options, command) => {
    // Additional generate logic.
  })

// region Propagate
program
  .command('propagate')
  .alias('prop')
  .alias('p')
  .description('Run the propagate command with options')
  .action((options, command) => {
    const parentOptions = command.parent.opts()
    console.log('Propagate command executed.')
    if (parentOptions.dryRun) {
      console.log('Dry run mode is enabled (global).')
    }
    // Additional propagate logic.
  })

// region Scan
program
  .command('scan')
  .alias('s')
  .description('Run the scan command with options')
  .action((options, command) => {
    const cwd = command.parent.opts().dir

    console.log(`Scanning directory: ${cwd}`)

    // Find all files ending in .meta.json recursively in the current dir, ignore node_modules
    const findMetaFiles = (dir) => {
      let results = []
      const list = fs.readdirSync(dir)
      list.forEach((file) => {
        const filePath = path.join(dir, file)
        const stat = fs.statSync(filePath)

        if (stat && stat.isDirectory()) {
          if (file !== 'node_modules') {
            results = results.concat(findMetaFiles(filePath))
          }
        } else if (file.endsWith('.meta.json')) {
          results.push(filePath)
        }
      })
      return results
    }
    const metaFiles = findMetaFiles(cwd)
    if (metaFiles.length === 0) {
      console.log('No .meta.json files found.')
      return
    }

    const table = new asciiTable('Found .meta.json files')
    table.setHeading('Target', 'Configured', 'Updated', 'Path')

    const ajv = new Ajv({ strict: true, allErrors: false })
    addFormats(ajv)

    for (const filePath of metaFiles) {
      try {
        const shortName = path.basename(filePath, '.meta.json')
        const schemaFile = path.join(CONFIG_SCHEMAS_PATH, `${shortName}.json`)

        const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
        const matchingSchema = fs.existsSync(schemaFile)
          ? JSON.parse(fs.readFileSync(schemaFile, 'utf-8'))
          : null
        const validate = matchingSchema ? ajv.compile(matchingSchema) : null

        const configured = !matchingSchema
          ? 'no'
          : validate(content)
            ? 'yes'
            : 'invalid'
        const updated = configured === 'yes' ? 'yes' : 'no'
        const fp = path.relative(cwd, filePath)

        table.addRow(shortName, configured, updated, fp)
      } catch (err) {
        console.error(`Error reading or parsing ${filePath}:`, err)
      }
    }

    console.log(table.toString())
  })

program.parse(process.argv)
