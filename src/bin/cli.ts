#!/usr/bin/env node

import { Command } from 'commander';
import { logger } from '../utils/logger.js';
import { registerInitCommand } from '../commands/init.js';
import { registerGenerateCommand } from '../commands/generate.js';
import { registerServeCommand } from '../commands/serve.js';
import { registerBuildCommand } from '../commands/build.js';
import { registerIndexCommand } from '../commands/index-docs.js';

import fs from 'node:fs';

const pkgJsonPath = new URL('../../package.json', import.meta.url);
const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));

const program = new Command();

program
  .name('mvdoc')
  .description('AI-Powered Documentation Generator — Generate smart docs from Jira, GitHub, and your codebase')
  .version(pkg.version, '-v, --version')
  .option('--verbose', 'Enable verbose output', false)
  .hook('preAction', (thisCommand) => {
    const opts = thisCommand.opts();
    if (opts.verbose) {
      logger.setVerbose(true);
    }
  });

// Register all commands
registerInitCommand(program);
registerGenerateCommand(program);
registerServeCommand(program);
registerBuildCommand(program);
registerIndexCommand(program);

// Show banner on help
program.addHelpText('before', () => {
  logger.banner();
  return '';
});

// Parse arguments
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  logger.banner();
  program.help();
}
