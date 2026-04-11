import { Command } from 'commander';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { logger } from '../utils/logger.js';
import { loadConfig } from '../utils/config.js';
import { exists } from '../utils/file-utils.js';

export function registerServeCommand(program: Command): void {
  program
    .command('serve')
    .description('Start VitePress dev server to preview documentation')
    .option('-p, --port <port>', 'Port number', '5173')
    .option('--no-open', 'Do not open browser automatically')
    .action(async (options) => {
      try {
        await runServe(options);
      } catch (err) {
        logger.error('Server failed', err);
        process.exit(1);
      }
    });
}

async function runServe(options: { port: string; open: boolean }): Promise<void> {
  logger.banner();
  logger.header('🌐 Starting Documentation Server');

  const config = loadConfig();
  const docsDir = path.resolve(config.output.dir);

  // Check if docs exist
  if (!exists(docsDir)) {
    logger.error(`Docs directory not found: ${docsDir}`);
    logger.info('Run `mvdoc generate` first to create documentation.');
    process.exit(1);
  }

  // Check if VitePress config exists
  const vitepressConfig = path.join(docsDir, '.vitepress', 'config.mts');
  if (!exists(vitepressConfig)) {
    logger.warn('VitePress config not found. Run `mvdoc generate` to create it.');
    logger.info('Starting with default VitePress settings...');
  }

  // Ensure vitepress is available
  logger.info(`Starting VitePress dev server on port ${options.port}...`);
  logger.info(`Docs directory: ${docsDir}`);
  logger.blank();

  // Spawn VitePress dev server
  const args = ['vitepress', 'dev', docsDir, '--port', options.port];
  if (options.open) {
    args.push('--open');
  }

  const child = spawn('npx', args, {
    stdio: 'inherit',
    shell: true,
    cwd: process.cwd(),
  });

  child.on('error', (err) => {
    logger.error('Failed to start VitePress server', err);
    logger.info('Make sure VitePress is installed: npm install -D vitepress');
    process.exit(1);
  });

  child.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      logger.error(`VitePress server exited with code ${code}`);
      process.exit(code);
    }
  });

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    child.kill('SIGINT');
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    child.kill('SIGTERM');
    process.exit(0);
  });
}
