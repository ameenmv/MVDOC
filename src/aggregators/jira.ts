// @ts-ignore — jira.js types
import { Version3Client } from 'jira.js';
import { logger } from '../utils/logger.js';
import type { MvdocSecrets } from '../utils/config.js';
import type { JiraStory, JiraEpic, JiraSprint, JiraSubtask } from '../types.js';

/**
 * Jira Data Aggregator
 * Fetches user stories, epics, and sprints from Jira Cloud API
 */

interface JiraConfig {
  host: string;
  projectKey: string;
  issueTypes: string[];
}

/**
 * Create an authenticated Jira client
 */
function createClient(config: JiraConfig, secrets: MvdocSecrets): Version3Client {
  if (!secrets.jiraEmail || !secrets.jiraToken) {
    throw new Error(
      'Jira credentials missing. Set MVDOC_JIRA_EMAIL and MVDOC_JIRA_TOKEN in your .env file.'
    );
  }

  return new Version3Client({
    host: config.host,
    authentication: {
      basic: {
        email: secrets.jiraEmail,
        apiToken: secrets.jiraToken,
      },
    },
  });
}

/**
 * Fetch all user stories from Jira project
 */
export async function fetchStories(
  config: JiraConfig,
  secrets: MvdocSecrets
): Promise<JiraStory[]> {
  const client = createClient(config, secrets);
  const spinner = logger.spinner('Fetching user stories from Jira...');

  try {
    const issueTypeFilter = config.issueTypes
      .map((t) => `"${t}"`)
      .join(', ');

    const jql = `project = "${config.projectKey}" AND issuetype IN (${issueTypeFilter}) ORDER BY created DESC`;

    const stories: JiraStory[] = [];
    let startAt = 0;
    const maxPerPage = 50;

    while (true) {
      const result = await client.issueSearch.searchForIssuesUsingJql({
        jql,
        startAt,
        maxResults: maxPerPage,
        fields: [
          'summary',
          'description',
          'status',
          'priority',
          'assignee',
          'labels',
          'subtasks',
          'created',
          'updated',
          'customfield_10014', // Epic Link (common)
          'customfield_10020', // Sprint (common)
          'customfield_10024', // Acceptance Criteria (varies)
        ],
      });

      if (!result.issues || result.issues.length === 0) break;

      for (const issue of result.issues) {
        const fields = issue.fields as Record<string, any>;

        const subtasks: JiraSubtask[] = (fields.subtasks || []).map(
          (st: any) => ({
            key: st.key,
            summary: st.fields?.summary || '',
            status: st.fields?.status?.name || 'Unknown',
          })
        );

        stories.push({
          key: issue.key || '',
          summary: fields.summary || '',
          description: extractDescription(fields.description),
          status: fields.status?.name || 'Unknown',
          priority: fields.priority?.name || 'Medium',
          assignee: fields.assignee?.displayName || null,
          epic: fields.customfield_10014 || null,
          sprint: extractSprintName(fields.customfield_10020),
          labels: fields.labels || [],
          acceptanceCriteria: fields.customfield_10024 || null,
          subtasks,
          created: fields.created || '',
          updated: fields.updated || '',
        });
      }

      startAt += result.issues.length;
      spinner.text = `Fetched ${stories.length} stories...`;

      // Check if we got all issues
      if (result.total && startAt >= result.total) break;
    }

    spinner.succeed(`Fetched ${stories.length} stories from Jira`);
    return stories;
  } catch (err) {
    spinner.fail('Failed to fetch stories from Jira');
    throw err;
  }
}

/**
 * Fetch all epics and group their stories
 */
export async function fetchEpics(
  config: JiraConfig,
  secrets: MvdocSecrets,
  stories: JiraStory[]
): Promise<JiraEpic[]> {
  const client = createClient(config, secrets);
  const spinner = logger.spinner('Fetching epics from Jira...');

  try {
    const jql = `project = "${config.projectKey}" AND issuetype = "Epic" ORDER BY created DESC`;

    const result = await client.issueSearch.searchForIssuesUsingJql({
      jql,
      maxResults: 100,
      fields: ['summary', 'description', 'status'],
    });

    const epics: JiraEpic[] = (result.issues || []).map((issue: any) => {
      const fields = issue.fields as Record<string, any>;
      const epicKey = issue.key || '';

      return {
        key: epicKey,
        summary: fields.summary || '',
        description: extractDescription(fields.description),
        status: fields.status?.name || 'Unknown',
        stories: stories.filter((s) => s.epic === epicKey),
      };
    });

    spinner.succeed(`Fetched ${epics.length} epics from Jira`);
    return epics;
  } catch (err) {
    spinner.fail('Failed to fetch epics from Jira');
    throw err;
  }
}

/**
 * Fetch sprint information
 */
export async function fetchSprints(
  config: JiraConfig,
  secrets: MvdocSecrets,
  stories: JiraStory[]
): Promise<JiraSprint[]> {
  // Group stories by sprint name
  const sprintMap = new Map<string, JiraStory[]>();

  for (const story of stories) {
    const sprintName = story.sprint || 'Backlog';
    if (!sprintMap.has(sprintName)) {
      sprintMap.set(sprintName, []);
    }
    sprintMap.get(sprintName)!.push(story);
  }

  const sprints: JiraSprint[] = [];
  let id = 1;

  for (const [name, sprintStories] of sprintMap) {
    sprints.push({
      id: id++,
      name,
      state: name === 'Backlog' ? 'future' : 'active',
      startDate: null,
      endDate: null,
      stories: sprintStories,
    });
  }

  logger.success(`Grouped stories into ${sprints.length} sprints`);
  return sprints;
}

// ─── Helpers ───

/**
 * Extract plain text description from Jira's ADF (Atlassian Document Format)
 */
function extractDescription(description: any): string {
  if (!description) return '';
  if (typeof description === 'string') return description;

  // ADF format — extract text content recursively
  try {
    return extractAdfText(description);
  } catch {
    return JSON.stringify(description);
  }
}

function extractAdfText(node: any): string {
  if (!node) return '';

  if (node.type === 'text') {
    return node.text || '';
  }

  if (node.content && Array.isArray(node.content)) {
    return node.content.map(extractAdfText).join('\n');
  }

  return '';
}

/**
 * Extract sprint name from Jira sprint field
 */
function extractSprintName(sprintField: any): string | null {
  if (!sprintField) return null;

  // Sprint field can be an array of sprint objects
  if (Array.isArray(sprintField) && sprintField.length > 0) {
    const latest = sprintField[sprintField.length - 1];
    return latest.name || null;
  }

  // Or a string representation
  if (typeof sprintField === 'string') {
    const match = sprintField.match(/name=([^,]+)/);
    return match ? match[1] : null;
  }

  return null;
}
