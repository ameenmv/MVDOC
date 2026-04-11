import fs from 'node:fs';
import path from 'node:path';
import { glob } from 'glob';

/**
 * Ensure a directory exists, creating it recursively if needed
 */
export function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Write content to a file, creating parent directories as needed
 */
export function writeFile(filePath: string, content: string): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf-8');
}

/**
 * Read a file's content, returning null if it doesn't exist
 */
export function readFile(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Check if a file or directory exists
 */
export function exists(filePath: string): boolean {
  return fs.existsSync(filePath);
}

/**
 * Get all files matching glob patterns
 */
export async function getFiles(
  patterns: string[],
  options: { cwd?: string; ignore?: string[] } = {}
): Promise<string[]> {
  const results: string[] = [];

  for (const pattern of patterns) {
    const files = await glob(pattern, {
      cwd: options.cwd || process.cwd(),
      ignore: options.ignore || ['node_modules/**', 'dist/**', '.git/**'],
      nodir: true,
      absolute: true,
    });
    results.push(...files);
  }

  // Deduplicate
  return [...new Set(results)];
}

/**
 * Get the language identifier from a file extension
 */
export function getLanguage(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const langMap: Record<string, string> = {
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.vue': 'vue',
    '.py': 'python',
    '.go': 'go',
    '.rs': 'rust',
    '.java': 'java',
    '.rb': 'ruby',
    '.php': 'php',
    '.css': 'css',
    '.scss': 'scss',
    '.html': 'html',
    '.json': 'json',
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.md': 'markdown',
    '.sql': 'sql',
    '.sh': 'shell',
    '.bash': 'shell',
    '.dockerfile': 'dockerfile',
  };

  return langMap[ext] || 'text';
}

/**
 * Get relative path from a base directory
 */
export function relativePath(filePath: string, basePath: string): string {
  return path.relative(basePath, filePath);
}

/**
 * Copy a directory recursively
 */
export function copyDir(src: string, dest: string): void {
  ensureDir(dest);
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Get directory tree structure as a formatted string
 */
export function getTreeString(
  dirPath: string,
  options: { maxDepth?: number; prefix?: string; depth?: number } = {}
): string {
  const { maxDepth = 4, prefix = '', depth = 0 } = options;

  if (depth >= maxDepth) return '';

  const entries = fs.readdirSync(dirPath, { withFileTypes: true })
    .filter((e) => !e.name.startsWith('.') && e.name !== 'node_modules' && e.name !== 'dist')
    .sort((a, b) => {
      // Directories first, then files
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

  let result = '';

  entries.forEach((entry, index) => {
    const isLast = index === entries.length - 1;
    const connector = isLast ? '└── ' : '├── ';
    const childPrefix = isLast ? '    ' : '│   ';

    result += `${prefix}${connector}${entry.name}\n`;

    if (entry.isDirectory()) {
      result += getTreeString(path.join(dirPath, entry.name), {
        maxDepth,
        prefix: prefix + childPrefix,
        depth: depth + 1,
      });
    }
  });

  return result;
}
