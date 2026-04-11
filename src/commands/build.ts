import { Command } from 'commander';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { logger } from '../utils/logger.js';
import { loadConfig } from '../utils/config.js';
import { exists } from '../utils/file-utils.js';

export function registerBuildCommand(program: Command): void {
  program
    .command('build')
    .description('Build VitePress documentation site for production')
    .option('--out-dir <path>', 'Output directory')
    .action(async (options) => {
      try {
        await runBuild(options);
      } catch (err) {
        logger.error('Build failed', err);
        process.exit(1);
      }
    });
}

async function runBuild(options: { outDir?: string }): Promise<void> {
  logger.banner();
  logger.header('🏗️  Building Documentation');

  const config = loadConfig();
  const docsDir = path.resolve(config.output.dir);

  if (!exists(docsDir)) {
    logger.error(`Docs directory not found: ${docsDir}`);
    logger.info('Run `mvdoc generate` first.');
    process.exit(1);
  }

  const spinner = logger.spinner('Building VitePress site...');

  try {
    let buildCmd = `npx vitepress build ${docsDir}`;
    if (options.outDir) {
      buildCmd += ` --outDir ${options.outDir}`;
    }

    execSync(buildCmd, {
      stdio: 'pipe',
      cwd: process.cwd(),
    });

    const outputPath = options.outDir || path.join(docsDir, '.vitepress', 'dist');
    spinner.succeed('Build complete!');
    logger.blank();
    logger.table({
      'Output': outputPath,
      'Status': 'Ready for deployment',
    });
    logger.blank();
    logger.info('Deploy the output directory to any static hosting provider.');
  } catch (err: any) {
    spinner.fail('Build failed');
    if (err.stderr) {
      console.error(err.stderr.toString());
    }
    throw err;
  }
}
