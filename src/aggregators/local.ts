import fs from 'node:fs';
import path from 'node:path';
import { logger } from '../utils/logger.js';
import { getFiles, getLanguage, readFile } from '../utils/file-utils.js';
import type { ProjectInfo, SourceFile } from '../types.js';

/**
 * Local Codebase Scanner
 * Analyzes the local project directory when GitHub is not configured
 */

interface LocalConfig {
  path: string;
  include: string[];
  exclude: string[];
}

/**
 * Scan a local project directory and extract project information
 */
export async function scanLocalProject(
  config: LocalConfig,
  cwd: string = process.cwd()
): Promise<ProjectInfo> {
  const projectPath = path.resolve(cwd, config.path);
  const spinner = logger.spinner('Scanning local codebase...');

  try {
    // 1. Read package.json
    const pkgJsonPath = path.join(projectPath, 'package.json');
    let pkgJson: Record<string, any> = {};

    if (fs.existsSync(pkgJsonPath)) {
      pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
    }

    // 2. Detect project type
    const projectType = detectProjectType(pkgJson);

    // 3. Get all directories
    const directories = getDirectories(projectPath, config.exclude);
    spinner.text = `Found ${directories.length} directories...`;

    // 4. Get source files
    const sourceFiles = await getSourceFiles(projectPath, config);
    spinner.text = `Found ${sourceFiles.length} source files...`;

    const projectInfo: ProjectInfo = {
      name: pkgJson.name || path.basename(projectPath),
      type: projectType,
      dependencies: pkgJson.dependencies || {},
      devDependencies: pkgJson.devDependencies || {},
      scripts: pkgJson.scripts || {},
      directories,
      sourceFiles,
    };

    spinner.succeed(
      `Scanned local codebase: ${sourceFiles.length} files, ${directories.length} dirs (${projectType})`
    );

    return projectInfo;
  } catch (err) {
    spinner.fail('Failed to scan local codebase');
    throw err;
  }
}

/**
 * Detect the project type based on package.json dependencies
 */
function detectProjectType(
  pkgJson: Record<string, any>
): ProjectInfo['type'] {
  const allDeps = {
    ...(pkgJson.dependencies || {}),
    ...(pkgJson.devDependencies || {}),
  };

  if (allDeps['nuxt'] || allDeps['nuxt3']) return 'nuxt';
  if (allDeps['vue'] || allDeps['@vue/cli-service']) return 'vue';
  if (allDeps['next']) return 'next';
  if (allDeps['react']) return 'react';
  if (allDeps['express'] || allDeps['fastify'] || allDeps['koa']) return 'node';

  return 'unknown';
}

/**
 * Get all directories (excluding ignored ones)
 */
function getDirectories(
  rootPath: string,
  exclude: string[]
): string[] {
  const dirs: string[] = [];
  const defaultExclude = ['node_modules', 'dist', '.git', '.next', '.nuxt', 'coverage', '.vitepress'];
  const allExclude = [...new Set([...defaultExclude, ...exclude])];

  function walkDir(currentPath: string, depth: number = 0): void {
    if (depth > 5) return; // Max depth

    try {
      const entries = fs.readdirSync(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (entry.name.startsWith('.') && entry.name !== '.vitepress') continue;
        if (allExclude.includes(entry.name)) continue;

        const fullPath = path.join(currentPath, entry.name);
        const relativePath = path.relative(rootPath, fullPath);
        dirs.push(relativePath);

        walkDir(fullPath, depth + 1);
      }
    } catch {
      // Permission denied or other error
    }
  }

  walkDir(rootPath);
  return dirs;
}

/**
 * Get source files with their content for AI analysis
 */
async function getSourceFiles(
  rootPath: string,
  config: LocalConfig
): Promise<SourceFile[]> {
  const files = await getFiles(config.include, {
    cwd: rootPath,
    ignore: [...config.exclude, 'node_modules/**', 'dist/**', '.git/**'],
  });

  const sourceFiles: SourceFile[] = [];
  const maxFileSize = 50 * 1024; // 50KB max per file
  const maxTotalFiles = 150;

  for (const filePath of files.slice(0, maxTotalFiles)) {
    try {
      const stats = fs.statSync(filePath);
      if (stats.size > maxFileSize) continue;

      const content = readFile(filePath);
      if (!content) continue;

      const language = getLanguage(filePath);

      // Skip binary-looking files
      if (language === 'text' && !filePath.endsWith('.env.example')) continue;

      sourceFiles.push({
        path: filePath,
        relativePath: path.relative(rootPath, filePath),
        language,
        content,
        size: stats.size,
      });
    } catch {
      // Skip unreadable files
    }
  }

  return sourceFiles;
}

/**
 * Get a tree representation of the project structure
 */
export function getProjectTree(
  config: LocalConfig,
  cwd: string = process.cwd()
): string {
  const projectPath = path.resolve(cwd, config.path);
  const { getTreeString } = require('../utils/file-utils.js');
  return getTreeString(projectPath);
}

/**
 * Get key files that are important for understanding the project
 * (entry points, configs, main components)
 */
export function getKeyFiles(sourceFiles: SourceFile[]): SourceFile[] {
  const keyPatterns = [
    /^index\.[jt]sx?$/,
    /^app\.[jt]sx?$/,
    /^main\.[jt]sx?$/,
    /^server\.[jt]sx?$/,
    /\.config\.[jt]sx?$/,
    /^routes?\//,
    /^api\//,
    /^pages?\//,
    /^layouts?\//,
    /^composables?\//,
    /^hooks?\//,
    /^stores?\//,
    /^services?\//,
    /^middleware\//,
  ];

  return sourceFiles.filter((file) =>
    keyPatterns.some((pattern) => pattern.test(file.relativePath))
  );
}
