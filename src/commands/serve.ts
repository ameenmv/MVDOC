import { Command } from 'commander';
import { spawn, execSync } from 'node:child_process';
import path from 'node:path';
import { logger } from '../utils/logger.js';
import { loadConfig } from '../utils/config.js';
import { exists, writeFile } from '../utils/file-utils.js';

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
  }

  // Ensure docs dir has a package.json so vitepress can be installed locally
  const pkgJson = path.join(docsDir, 'package.json');
  if (!exists(pkgJson)) {
    writeFile(
      pkgJson,
      JSON.stringify(
        {
          name: config.project.name.toLowerCase().replace(/\s+/g, '-') + '-docs',
          version: '1.0.0',
          private: true,
        },
        null,
        2
      )
    );
  }

  // Install vitepress locally in the docs dir if not already installed
  const vitepressInstalled = exists(path.join(docsDir, 'node_modules', 'vitepress'));
  if (!vitepressInstalled) {
    const installSpinner = logger.spinner('Installing VitePress in docs directory...');
    try {
      execSync('npm install vitepress --save-dev --prefer-offline', {
        cwd: docsDir,
        stdio: 'pipe',
      });
      installSpinner.succeed('VitePress installed');
    } catch {
      installSpinner.fail('Failed to install VitePress automatically');
      logger.info(`Run manually: cd ${docsDir} && npm install vitepress`);
      process.exit(1);
    }
  }

  logger.info(`Starting VitePress dev server on port ${options.port}...`);
  logger.info(`Docs directory: ${docsDir}`);
  logger.blank();

  // Run vitepress FROM the docs directory so it resolves its own node_modules
  const args = ['vitepress', 'dev', '.', '--port', options.port];
  if (options.open) {
    args.push('--open');
  }

  const child = spawn('npx', args, {
    stdio: 'inherit',
    shell: true,
    cwd: docsDir, // ← key fix: run from docs dir, not project root
  });

  child.on('error', (err) => {
    logger.error('Failed to start VitePress server', err);
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
