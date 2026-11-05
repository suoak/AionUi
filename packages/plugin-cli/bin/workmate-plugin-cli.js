#!/usr/bin/env node
import { runCli } from '../src/index.ts';

const code = await runCli(process.argv.slice(2));
process.exit(code);
