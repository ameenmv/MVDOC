# mvdoc — AI-Powered Documentation Generator

> Generate smart, living documentation from your Jira stories, GitHub code, and codebase — powered by Gemini AI.

[![npm version](https://img.shields.io/npm/v/mvdoc.svg)](https://www.npmjs.com/package/mvdoc)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- **Jira Integration** — Pulls user stories, epics, and sprints from Jira Cloud.
- **GitHub Integration** — Analyzes repository structure, code, and commits.
- **AI-Powered Analysis** — Uses Gemini, OpenAI, Groq, or Local LLMs to generate technical specs.
- **Auto Diagrams** — Generates Mermaid.js flowcharts, sequence diagrams, and ER diagrams autonomously.
- **Ask Your Docs (RAG)** — Interact with your documentation using an AI-powered chat interface.
- **VitePress Site** — Produces a beautiful, searchable documentation website out of the box.

## Quick Start

```bash
# Install globally
npm install -g mvdoc-cli

# Navigate to your project directory
cd my-project

# Initialize (interactive setup)
mvdoc init

# Generate documentation files
mvdoc generate

# Preview locally
mvdoc serve

# Build for production deployment
mvdoc build
```

## Commands

### `mvdoc init`

Interactive setup wizard that configures:
- Jira connection details (host, project key, API token)
- GitHub connection (repository, access token)
- AI Provider selection (Gemini or OpenAI/Groq/Custom)
- Documentation output directory preferences

This command creates `.mvdocrc.json` (configuration) and `.env` (secrets).

### `mvdoc generate`

Runs the full documentation generation pipeline:
1. **Aggregates** data from Jira, GitHub, and the local codebase.
2. **Processes** user stories into technical specifications via AI.
3. **Generates** Mermaid diagrams (architecture, data flow, sequence, ER).
4. **Creates** Markdown pages formatted for VitePress.

```bash
# Full generation pipeline
mvdoc generate

# Skip AI processing (use raw data only)
mvdoc generate --skip-ai

# Skip diagram generation to speed up the process
mvdoc generate --skip-diagrams

# Preview what would be generated without writing to disk
mvdoc generate --dry-run

# Limit data aggregation to specific sources
mvdoc generate --source local,github
```

### `mvdoc serve`

Starts a local VitePress development server to preview your generated documentation.

```bash
mvdoc serve
mvdoc serve --port 3000
mvdoc serve --no-open
```

### `mvdoc build`

Compiles the VitePress site into static HTML/CSS/JS for production deployment.

```bash
mvdoc build
mvdoc build --out-dir ./public
```

### `mvdoc index`

Indexes the generated documentation to enable the RAG (Retrieval-Augmented Generation) chatbot. Creates vector embeddings locally.

```bash
mvdoc index
mvdoc index --force  # Re-index all documents
```

### `mvdoc chat`

Interact with your indexed documentation using AI.

```bash
# Start an interactive CLI chat session
mvdoc chat

# Start a background API server for the VitePress web widget
mvdoc chat --serve
mvdoc chat --serve --port 3456
```

## Configuration

### `.mvdocrc.json`

```json
{
  "project": {
    "name": "My Project",
    "description": "A description of the project"
  },
  "sources": {
    "jira": {
      "host": "https://your-company.atlassian.net",
      "projectKey": "PROJ",
      "issueTypes": ["Story", "Epic", "Bug"]
    },
    "github": {
      "owner": "your-org",
      "repo": "your-repo",
      "branch": "main"
    },
    "local": {
      "path": ".",
      "include": ["src/**/*"],
      "exclude": ["node_modules", "dist"]
    }
  },
  "output": {
    "dir": "./docs",
    "diagrams": true,
    "modules": ["src/**/*"]
  },
  "ai": {
    "provider": "openai",
    "model": "llama3-70b-8192",
    "baseUrl": "https://api.groq.com/openai/v1"
  }
}
```

### `.env` (Do NOT commit)

```env
MVDOC_JIRA_EMAIL=your-email@company.com
MVDOC_JIRA_TOKEN=your-jira-api-token
MVDOC_GITHUB_TOKEN=ghp_your-github-token
MVDOC_GEMINI_KEY=AIza-your-gemini-key
MVDOC_OPENAI_KEY=your-openai-or-groq-key
```

## Generated Documentation Structure

```text
docs/
├── index.md              # Homepage with project metrics
├── overview.md           # AI-generated project overview
├── architecture/
│   └── index.md          # Diagrams (architecture, data flow, ER)
├── stories/
│   ├── index.md          # Story index with status tracking
│   ├── proj-1.md         # Individual story with technical specifications
│   └── epic-proj-10.md   # Epic grouping view
├── modules/
│   ├── index.md          # Module index
│   └── auth.md           # AI-analyzed module documentation
└── .vitepress/
    ├── config.mts         # Auto-generated VitePress configuration
    └── theme/
        ├── index.ts       # Custom theme configuration
        ├── style.css      # Brand styling
        └── components/
            └── ChatWidget.vue  # Interactive RAG chat component
```

## AI Model Usage

| Feature | Primary Model | Purpose |
|---------|---------------|---------|
| Story to Spec | Gemini/OpenAI/Groq | Translates user stories into technical specifications |
| Diagram Generation | Gemini/OpenAI/Groq | Generates structural Mermaid.js syntax |
| Module Analysis | Gemini/OpenAI/Groq | Reads source code and documents modules |
| Project Overview | Gemini/OpenAI/Groq | Summarizes the holistic project state |
| RAG Embeddings | text-embedding-004 / text-embedding-3-small | Creates vector embeddings for document search |
| Ask Your Docs | Gemini/OpenAI/Groq | Processes context to answer user queries |

## License

MIT © Ameen
