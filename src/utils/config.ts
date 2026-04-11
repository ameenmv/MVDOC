import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

/**
 * mvdoc configuration schema
 */
export interface MvdocConfig {
  project: {
    name: string;
    description?: string;
  };
  sources: {
    jira?: {
      host: string;
      projectKey: string;
      issueTypes: string[];
    };
    github?: {
      owner: string;
      repo: string;
      branch: string;
    };
    local?: {
      path: string;
      include: string[];
      exclude: string[];
    };
  };
  output: {
    dir: string;
    diagrams: boolean;
    modules: string[];
  };
  ai: {
    provider: 'gemini' | 'openai';
    model: string;
    baseUrl?: string;
  };
}

/**
 * Secrets loaded from .env
 */
export interface MvdocSecrets {
  jiraEmail?: string;
  jiraToken?: string;
  githubToken?: string;
  geminiKey?: string;
  openaiKey?: string;
}

const CONFIG_FILENAME = '.mvdocrc.json';
const ENV_FILENAME = '.env';

/**
 * Get the default config
 */
export function getDefaultConfig(projectName: string): MvdocConfig {
  return {
    project: {
      name: projectName,
    },
    sources: {
      local: {
        path: '.',
        include: ['src/**/*'],
        exclude: ['node_modules', 'dist', '.git'],
      },
    },
    output: {
      dir: './docs',
      diagrams: true,
      modules: ['src/**/*'],
    },
    ai: {
      provider: 'gemini',
      model: 'gemini-2.0-flash',
    },
  };
}

/**
 * Find config file by traversing up directories
 */
function findConfigFile(startDir: string): string | null {
  let dir = path.resolve(startDir);

  while (true) {
    const configPath = path.join(dir, CONFIG_FILENAME);
    if (fs.existsSync(configPath)) {
      return configPath;
    }

    const parentDir = path.dirname(dir);
    if (parentDir === dir) {
      // Reached filesystem root
      return null;
    }
    dir = parentDir;
  }
}

/**
 * Load the mvdoc configuration from .mvdocrc.json
 */
export function loadConfig(cwd: string = process.cwd()): MvdocConfig {
  const configPath = findConfigFile(cwd);

  if (!configPath) {
    throw new Error(
      `Config file "${CONFIG_FILENAME}" not found. Run "mvdoc init" first.`
    );
  }

  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(raw) as MvdocConfig;
    return config;
  } catch (err) {
    throw new Error(
      `Failed to parse "${CONFIG_FILENAME}": ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/**
 * Load secrets from .env file
 */
export function loadSecrets(cwd: string = process.cwd()): MvdocSecrets {
  const envPath = path.join(cwd, ENV_FILENAME);

  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
  }

  return {
    jiraEmail: process.env.MVDOC_JIRA_EMAIL,
    jiraToken: process.env.MVDOC_JIRA_TOKEN,
    githubToken: process.env.MVDOC_GITHUB_TOKEN,
    geminiKey: process.env.MVDOC_GEMINI_KEY,
    openaiKey: process.env.MVDOC_OPENAI_KEY,
  };
}

/**
 * Save config to .mvdocrc.json
 */
export function saveConfig(config: MvdocConfig, cwd: string = process.cwd()): void {
  const configPath = path.join(cwd, CONFIG_FILENAME);
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

/**
 * Save secrets to .env file
 */
export function saveSecrets(secrets: MvdocSecrets, cwd: string = process.cwd()): void {
  const envPath = path.join(cwd, ENV_FILENAME);

  const lines: string[] = [
    '# mvdoc secrets — DO NOT COMMIT THIS FILE',
    '',
  ];

  if (secrets.jiraEmail) {
    lines.push(`MVDOC_JIRA_EMAIL=${secrets.jiraEmail}`);
  }
  if (secrets.jiraToken) {
    lines.push(`MVDOC_JIRA_TOKEN=${secrets.jiraToken}`);
  }
  if (secrets.githubToken) {
    lines.push(`MVDOC_GITHUB_TOKEN=${secrets.githubToken}`);
  }
  if (secrets.geminiKey) {
    lines.push(`MVDOC_GEMINI_KEY=${secrets.geminiKey}`);
  }
  if (secrets.openaiKey) {
    lines.push(`MVDOC_OPENAI_KEY=${secrets.openaiKey}`);
  }

  lines.push('');
  fs.writeFileSync(envPath, lines.join('\n'), 'utf-8');
}

/**
 * Ensure .env is in .gitignore
 */
export function ensureGitignore(cwd: string = process.cwd()): void {
  const gitignorePath = path.join(cwd, '.gitignore');
  let content = '';

  if (fs.existsSync(gitignorePath)) {
    content = fs.readFileSync(gitignorePath, 'utf-8');
  }

  const entriesToAdd = ['.env', '.lancedb/'];
  const newEntries: string[] = [];

  for (const entry of entriesToAdd) {
    if (!content.includes(entry)) {
      newEntries.push(entry);
    }
  }

  if (newEntries.length > 0) {
    const addition = '\n# mvdoc secrets\n' + newEntries.join('\n') + '\n';
    fs.writeFileSync(gitignorePath, content + addition, 'utf-8');
  }
}

/**
 * Validate that required config fields are present
 */
export function validateConfig(config: MvdocConfig): string[] {
  const errors: string[] = [];

  if (!config.project?.name) {
    errors.push('project.name is required');
  }

  if (!config.output?.dir) {
    errors.push('output.dir is required');
  }

  if (!config.ai?.provider) {
    errors.push('ai.provider is required');
  }

  return errors;
}
