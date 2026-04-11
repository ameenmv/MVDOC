import { Octokit } from 'octokit';
import { logger } from '../utils/logger.js';
import type { MvdocSecrets } from '../utils/config.js';
import type { RepoFile, RepoStructure, RepoCommit } from '../types.js';

/**
 * GitHub Data Aggregator
 * Fetches repository structure, file contents, commits, and README
 */

interface GitHubConfig {
  owner: string;
  repo: string;
  branch: string;
}

/**
 * Create an authenticated Octokit client
 */
function createClient(secrets: MvdocSecrets): Octokit {
  if (!secrets.githubToken) {
    throw new Error(
      'GitHub token missing. Set MVDOC_GITHUB_TOKEN in your .env file.'
    );
  }

  return new Octokit({ auth: secrets.githubToken });
}

/**
 * Fetch the full repository file tree
 */
export async function getRepoTree(
  config: GitHubConfig,
  secrets: MvdocSecrets
): Promise<RepoStructure> {
  const octokit = createClient(secrets);
  const spinner = logger.spinner('Fetching repository structure from GitHub...');

  try {
    // Get the branch reference
    const { data: refData } = await octokit.rest.git.getRef({
      owner: config.owner,
      repo: config.repo,
      ref: `heads/${config.branch}`,
    });

    const treeSha = refData.object.sha;

    // Fetch recursive tree
    const { data: treeData } = await octokit.rest.git.getTree({
      owner: config.owner,
      repo: config.repo,
      tree_sha: treeSha,
      recursive: '1',
    });

    const tree: RepoFile[] = treeData.tree
      .filter((item) => {
        // Skip common non-essential files
        const skip = [
          'node_modules/',
          '.git/',
          'dist/',
          '.next/',
          '.nuxt/',
          'coverage/',
          'package-lock.json',
          'yarn.lock',
          'pnpm-lock.yaml',
        ];
        return !skip.some((s) => item.path?.startsWith(s) || item.path === s.replace('/', ''));
      })
      .map((item) => ({
        path: item.path || '',
        type: item.type as 'blob' | 'tree',
        sha: item.sha || '',
        size: item.size,
      }));

    // Fetch README
    const readme = await getReadme(config, secrets, octokit);

    spinner.succeed(`Fetched ${tree.length} files from GitHub`);

    return {
      owner: config.owner,
      repo: config.repo,
      branch: config.branch,
      tree,
      readme,
    };
  } catch (err) {
    spinner.fail('Failed to fetch repository structure');
    throw err;
  }
}

/**
 * Fetch content of a specific file from the repo
 */
export async function getFileContent(
  config: GitHubConfig,
  secrets: MvdocSecrets,
  filePath: string
): Promise<string> {
  const octokit = createClient(secrets);

  try {
    const { data } = await octokit.rest.repos.getContent({
      owner: config.owner,
      repo: config.repo,
      path: filePath,
      ref: config.branch,
    });

    if ('content' in data && data.content) {
      return Buffer.from(data.content, 'base64').toString('utf-8');
    }

    return '';
  } catch {
    logger.debug(`Could not fetch file: ${filePath}`);
    return '';
  }
}

/**
 * Fetch multiple files' content in batch
 */
export async function getFilesContent(
  config: GitHubConfig,
  secrets: MvdocSecrets,
  filePaths: string[]
): Promise<Map<string, string>> {
  const contents = new Map<string, string>();
  const spinner = logger.spinner(`Fetching ${filePaths.length} files from GitHub...`);

  // Fetch in parallel with concurrency limit
  const concurrency = 5;
  for (let i = 0; i < filePaths.length; i += concurrency) {
    const batch = filePaths.slice(i, i + concurrency);
    const results = await Promise.all(
      batch.map(async (fp) => {
        const content = await getFileContent(config, secrets, fp);
        return { path: fp, content };
      })
    );

    for (const result of results) {
      if (result.content) {
        contents.set(result.path, result.content);
      }
    }

    spinner.text = `Fetched ${Math.min(i + concurrency, filePaths.length)}/${filePaths.length} files...`;
  }

  spinner.succeed(`Fetched ${contents.size} files from GitHub`);
  return contents;
}

/**
 * Fetch recent commit history
 */
export async function getCommitHistory(
  config: GitHubConfig,
  secrets: MvdocSecrets,
  options: { path?: string; maxCount?: number } = {}
): Promise<RepoCommit[]> {
  const octokit = createClient(secrets);
  const { path: filePath, maxCount = 50 } = options;

  try {
    const { data } = await octokit.rest.repos.listCommits({
      owner: config.owner,
      repo: config.repo,
      sha: config.branch,
      path: filePath,
      per_page: maxCount,
    });

    return data.map((commit) => ({
      sha: commit.sha,
      message: commit.commit.message,
      author: commit.commit.author?.name || 'Unknown',
      date: commit.commit.author?.date || '',
      files: [], // Would need another API call per commit
    }));
  } catch {
    logger.debug('Could not fetch commit history');
    return [];
  }
}

/**
 * Fetch the README file
 */
async function getReadme(
  config: GitHubConfig,
  secrets: MvdocSecrets,
  octokit?: Octokit
): Promise<string | null> {
  const client = octokit || createClient(secrets);

  try {
    const { data } = await client.rest.repos.getReadme({
      owner: config.owner,
      repo: config.repo,
      ref: config.branch,
    });

    if ('content' in data && data.content) {
      return Buffer.from(data.content, 'base64').toString('utf-8');
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Get source files filtered by language/extension for AI analysis
 */
export function filterSourceFiles(
  tree: RepoFile[],
  options: { extensions?: string[]; maxFiles?: number } = {}
): RepoFile[] {
  const {
    extensions = ['.ts', '.tsx', '.js', '.jsx', '.vue', '.py', '.go', '.java', '.rb', '.php'],
    maxFiles = 100,
  } = options;

  return tree
    .filter((f) => {
      if (f.type !== 'blob') return false;
      return extensions.some((ext) => f.path.endsWith(ext));
    })
    .slice(0, maxFiles);
}
