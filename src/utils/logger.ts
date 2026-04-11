import chalk from 'chalk';
import ora, { type Ora } from 'ora';

/**
 * Pretty console logger with colored output and spinners
 */
class Logger {
  private verbose = false;

  setVerbose(value: boolean): void {
    this.verbose = value;
  }

  // ─── Basic Logs ───

  info(message: string): void {
    console.log(chalk.blue('ℹ'), message);
  }

  success(message: string): void {
    console.log(chalk.green('✓'), message);
  }

  warn(message: string): void {
    console.log(chalk.yellow('⚠'), message);
  }

  error(message: string, err?: unknown): void {
    console.error(chalk.red('✖'), message);
    if (err && this.verbose) {
      console.error(chalk.dim(String(err)));
    }
  }

  debug(message: string): void {
    if (this.verbose) {
      console.log(chalk.dim('⊙'), chalk.dim(message));
    }
  }

  // ─── Styled Output ───

  header(title: string): void {
    const line = '─'.repeat(50);
    console.log('');
    console.log(chalk.cyan(line));
    console.log(chalk.cyan.bold(`  ${title}`));
    console.log(chalk.cyan(line));
    console.log('');
  }

  subheader(title: string): void {
    console.log('');
    console.log(chalk.white.bold(`── ${title} ──`));
  }

  step(number: number, total: number, message: string): void {
    const progress = chalk.dim(`[${number}/${total}]`);
    console.log(`${progress} ${message}`);
  }

  table(data: Record<string, string>): void {
    const maxKey = Math.max(...Object.keys(data).map((k) => k.length));
    for (const [key, value] of Object.entries(data)) {
      console.log(`  ${chalk.dim(key.padEnd(maxKey))}  ${value}`);
    }
  }

  blank(): void {
    console.log('');
  }

  // ─── Spinners ───

  spinner(text: string): Ora {
    return ora({
      text,
      color: 'cyan',
      spinner: 'dots',
    }).start();
  }

  // ─── Branding ───

  banner(): void {
    console.log('');
    console.log(
      chalk.cyan.bold('  ╔══════════════════════════════════╗')
    );
    console.log(
      chalk.cyan.bold('  ║') +
        chalk.white.bold('   📄 mvdoc ') +
        chalk.dim('v0.1.0') +
        chalk.cyan.bold('              ║')
    );
    console.log(
      chalk.cyan.bold('  ║') +
        chalk.dim('   AI-Powered Docs Generator') +
        chalk.cyan.bold('     ║')
    );
    console.log(
      chalk.cyan.bold('  ╚══════════════════════════════════╝')
    );
    console.log('');
  }
}

export const logger = new Logger();
