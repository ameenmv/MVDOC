import { Command } from 'commander';
import prompts from 'prompts';
import path from 'node:path';
import { logger } from '../utils/logger.js';
import {
  getDefaultConfig,
  saveConfig,
  saveSecrets,
  ensureGitignore,
  type MvdocConfig,
  type MvdocSecrets,
} from '../utils/config.js';
import { ensureDir, writeFile, exists } from '../utils/file-utils.js';

export function registerInitCommand(program: Command): void {
  program
    .command('init')
    .description('Initialize mvdoc in your project — set up config, secrets, and docs scaffold')
    .option('-y, --yes', 'Skip interactive prompts, use defaults', false)
    .option('--dir <path>', 'Project directory', '.')
    .action(async (options) => {
      try {
        await runInit(options);
      } catch (err) {
        if ((err as Error).message?.includes('cancelled')) {
          logger.warn('Setup cancelled.');
          process.exit(0);
        }
        logger.error('Init failed', err);
        process.exit(1);
      }
    });
}

async function runInit(options: { yes: boolean; dir: string }): Promise<void> {
  const cwd = path.resolve(options.dir);

  logger.banner();
  logger.header('🚀 Project Setup');

  // Check if already initialized
  if (exists(path.join(cwd, '.mvdocrc.json'))) {
    const { overwrite } = await prompts({
      type: 'confirm',
      name: 'overwrite',
      message: 'mvdoc is already initialized. Overwrite config?',
      initial: false,
    });
    if (!overwrite) {
      logger.info('Keeping existing config.');
      return;
    }
  }

  let config: MvdocConfig;
  let secrets: MvdocSecrets;

  if (options.yes) {
    // Use defaults
    const projectName = path.basename(cwd);
    config = getDefaultConfig(projectName);
    secrets = {};
    logger.info('Using default configuration.');
  } else {
    // Interactive setup
    const result = await interactiveSetup(cwd);
    config = result.config;
    secrets = result.secrets;
  }

  // Save everything
  const spinner = logger.spinner('Saving configuration...');

  // 1. Save config
  saveConfig(config, cwd);
  spinner.text = 'Config saved to .mvdocrc.json';

  // 2. Save secrets
  if (Object.values(secrets).some(Boolean)) {
    saveSecrets(secrets, cwd);
    spinner.text = 'Secrets saved to .env';
  }

  // 3. Ensure .gitignore
  ensureGitignore(cwd);
  spinner.text = 'Updated .gitignore';

  // 4. Scaffold docs directory
  const docsDir = path.join(cwd, config.output.dir);
  scaffoldDocs(docsDir, config);
  spinner.text = 'Scaffolded docs directory';

  spinner.succeed('Project initialized successfully!');

  // Print summary
  logger.blank();
  logger.subheader('Summary');
  logger.table({
    'Config': '.mvdocrc.json',
    'Secrets': '.env',
    'Docs Dir': config.output.dir,
    'AI Model': config.ai.model,
    'Jira': config.sources.jira ? `${config.sources.jira.host} (${config.sources.jira.projectKey})` : 'Not configured',
    'GitHub': config.sources.github ? `${config.sources.github.owner}/${config.sources.github.repo}` : 'Not configured',
  });

  logger.blank();
  logger.info(`Next steps:`);
  console.log(`  1. ${config.sources.jira || config.sources.github ? '' : 'Add Jira/GitHub config to .mvdocrc.json'}`)
  console.log(`  2. Run ${logger ? 'mvdoc generate' : 'mvdoc generate'} to generate docs`);
  console.log(`  3. Run ${'mvdoc serve'} to preview locally`);
  logger.blank();
}

async function interactiveSetup(cwd: string): Promise<{ config: MvdocConfig; secrets: MvdocSecrets }> {
  const projectName = path.basename(cwd);

  // ─── Project Info ───
  logger.subheader('Project Details');

  const projectAnswers = await prompts([
    {
      type: 'text',
      name: 'name',
      message: 'Project name:',
      initial: projectName,
    },
    {
      type: 'text',
      name: 'description',
      message: 'Project description:',
      initial: '',
    },
    {
      type: 'text',
      name: 'docsDir',
      message: 'Documentation directory:',
      initial: './docs',
    },
  ]);

  // ─── Source Selection ───
  logger.subheader('Data Sources');

  const sourceAnswers = await prompts({
    type: 'multiselect',
    name: 'sources',
    message: 'Select data sources:',
    choices: [
      { title: 'Jira (User Stories & Epics)', value: 'jira' },
      { title: 'GitHub (Code & Commits)', value: 'github' },
      { title: 'Local Codebase (Scan current directory)', value: 'local', selected: true },
    ],
    min: 1,
  });

  const config = getDefaultConfig(projectAnswers.name);
  config.project.description = projectAnswers.description;
  config.output.dir = projectAnswers.docsDir;
  const secrets: MvdocSecrets = {};

  // ─── Jira Config ───
  if (sourceAnswers.sources.includes('jira')) {
    logger.subheader('Jira Configuration');

    const jiraAnswers = await prompts([
      {
        type: 'text',
        name: 'host',
        message: 'Jira Host URL:',
        initial: 'https://your-company.atlassian.net',
        validate: (v: string) => v.startsWith('https://') || 'Must start with https://',
      },
      {
        type: 'text',
        name: 'email',
        message: 'Jira Email:',
        validate: (v: string) => v.includes('@') || 'Must be a valid email',
      },
      {
        type: 'password',
        name: 'token',
        message: 'Jira API Token:',
        validate: (v: string) => v.length > 0 || 'Token is required',
      },
      {
        type: 'text',
        name: 'projectKey',
        message: 'Jira Project Key:',
        validate: (v: string) => v.length > 0 || 'Project key is required',
      },
      {
        type: 'multiselect',
        name: 'issueTypes',
        message: 'Issue types to include:',
        choices: [
          { title: 'Story', value: 'Story', selected: true },
          { title: 'Epic', value: 'Epic', selected: true },
          { title: 'Bug', value: 'Bug' },
          { title: 'Task', value: 'Task' },
        ],
      },
    ]);

    config.sources.jira = {
      host: jiraAnswers.host,
      projectKey: jiraAnswers.projectKey,
      issueTypes: jiraAnswers.issueTypes,
    };
    secrets.jiraEmail = jiraAnswers.email;
    secrets.jiraToken = jiraAnswers.token;
  }

  // ─── GitHub Config ───
  if (sourceAnswers.sources.includes('github')) {
    logger.subheader('GitHub Configuration');

    const githubAnswers = await prompts([
      {
        type: 'text',
        name: 'repoUrl',
        message: 'GitHub Repository (owner/repo):',
        validate: (v: string) => v.includes('/') || 'Format: owner/repo',
      },
      {
        type: 'password',
        name: 'token',
        message: 'GitHub Personal Access Token:',
        validate: (v: string) => v.length > 0 || 'Token is required',
      },
      {
        type: 'text',
        name: 'branch',
        message: 'Default branch:',
        initial: 'main',
      },
    ]);

    const [owner, repo] = githubAnswers.repoUrl.split('/');
    config.sources.github = {
      owner,
      repo,
      branch: githubAnswers.branch,
    };
    secrets.githubToken = githubAnswers.token;
  }

  // ─── Local Config ───
  if (sourceAnswers.sources.includes('local')) {
    config.sources.local = {
      path: '.',
      include: ['src/**/*'],
      exclude: ['node_modules', 'dist', '.git'],
    };
  }

  // ─── AI Config ───
  logger.subheader('AI Configuration');
  logger.info('Paste your API key — we\'ll detect the provider automatically.');
  logger.info('Supported: Gemini (AIza...), Groq (gsk_...), OpenAI (sk-...), xAI (xai-)');

  const keyAnswer = await prompts({
    type: 'password',
    name: 'apiKey',
    message: 'API Key:',
    validate: (v: string) => v.length > 0 || 'API key is required',
  });

  const detected = detectProviderFromKey(keyAnswer.apiKey);
  config.ai.provider = detected.provider;
  config.ai.model = detected.model;
  if (detected.baseUrl) config.ai.baseUrl = detected.baseUrl;

  if (detected.provider === 'gemini') {
    secrets.geminiKey = keyAnswer.apiKey;
  } else {
    secrets.openaiKey = keyAnswer.apiKey;
  }

  logger.info(`✓ Detected: ${detected.label} — using model ${detected.model}`);

  // Wait, let's also fix the default local include pattern to not strictly be src/**/*
  if (config.sources.local) {
    config.sources.local.include = ['src/**/*', 'components/**/*', 'pages/**/*', 'app/**/*'];
  }

  return { config, secrets };
}

interface DetectedProvider {
  provider: 'gemini' | 'openai';
  model: string;
  baseUrl?: string;
  label: string;
}

/**
 * Detect the AI provider and pick the best default model from an API key prefix.
 * - Gemini:  AIza...
 * - Groq:    gsk_...
 * - OpenAI:  sk-...
 * - xAI:     xai-...
 */
function detectProviderFromKey(key: string): DetectedProvider {
  const k = key.trim();

  if (k.startsWith('AIza')) {
    return { provider: 'gemini', model: 'gemini-2.0-flash', label: 'Google Gemini 2.0 Flash' };
  }
  if (k.startsWith('gsk_')) {
    return {
      provider: 'openai',
      model: 'llama3-70b-8192',
      baseUrl: 'https://api.groq.com/openai/v1',
      label: 'Groq LLaMA 3 70B',
    };
  }
  if (k.startsWith('xai-')) {
    return {
      provider: 'openai',
      model: 'grok-3',
      baseUrl: 'https://api.x.ai/v1',
      label: 'xAI Grok 3',
    };
  }
  if (k.startsWith('sk-')) {
    return {
      provider: 'openai',
      model: 'gpt-4o-mini',
      baseUrl: 'https://api.openai.com/v1',
      label: 'OpenAI GPT-4o-mini',
    };
  }

  // Unknown prefix — fall back to Gemini-compatible guess
  logger.warn('⚠ Could not detect provider from key prefix. Defaulting to Gemini.');
  return { provider: 'gemini', model: 'gemini-2.0-flash', label: 'Google Gemini 2.0 Flash (fallback)' };
}

/**
 * Scaffold the initial VitePress docs directory structure
 */
function scaffoldDocs(docsDir: string, config: MvdocConfig): void {
  ensureDir(docsDir);
  ensureDir(path.join(docsDir, '.vitepress'));
  ensureDir(path.join(docsDir, 'stories'));
  ensureDir(path.join(docsDir, 'modules'));
  ensureDir(path.join(docsDir, 'architecture'));

  // Create initial index page
  if (!exists(path.join(docsDir, 'index.md'))) {
    writeFile(
      path.join(docsDir, 'index.md'),
      `---
layout: home
hero:
  name: "${config.project.name}"
  text: "AI-Generated Documentation"
  tagline: "Auto-generated from Jira stories, GitHub code, and AI analysis"
  actions:
    - theme: brand
      text: Architecture →
      link: /architecture/
    - theme: alt
      text: User Stories
      link: /stories/
features:
  - icon: 🧠
    title: AI-Powered
    details: Documentation generated and maintained by AI, always in sync with your codebase.
  - icon: 📊
    title: Visual Diagrams
    details: Auto-generated flowcharts, sequence diagrams, and architecture views.
  - icon: 💬
    title: Ask Your Docs
    details: Chat with your documentation using RAG-powered AI assistant.
---
`
    );
  }

  // Create placeholder pages
  if (!exists(path.join(docsDir, 'stories', 'index.md'))) {
    writeFile(
      path.join(docsDir, 'stories', 'index.md'),
      `# User Stories\n\nRun \`mvdoc generate\` to populate this section with your Jira stories.\n`
    );
  }

  if (!exists(path.join(docsDir, 'modules', 'index.md'))) {
    writeFile(
      path.join(docsDir, 'modules', 'index.md'),
      `# Modules\n\nRun \`mvdoc generate\` to populate this section with your codebase modules.\n`
    );
  }

  if (!exists(path.join(docsDir, 'architecture', 'index.md'))) {
    writeFile(
      path.join(docsDir, 'architecture', 'index.md'),
      `# Architecture\n\nRun \`mvdoc generate\` to generate architecture diagrams and documentation.\n`
    );
  }
}
