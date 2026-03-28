#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const pexec = promisify(execFile);
const files = process.argv.slice(2);
await pexec('npx', ['json-schema-to-typescript', ...files]);
