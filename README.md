# 📄 mvdoc — AI-Powered Documentation Generator

> Generate smart, living documentation from your Jira stories, GitHub code, and codebase — powered by Gemini AI.

[![npm version](https://img.shields.io/npm/v/mvdoc.svg)](https://www.npmjs.com/package/mvdoc)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## ✨ Features

- 📋 **Jira Integration** — Pulls user stories, epics, and sprints from Jira Cloud
- 🐙 **GitHub Integration** — Analyzes repository structure, code, and commits
- 🧠 **AI-Powered Analysis** — Uses Gemini to generate technical specs and documentation
- 📊 **Auto Diagrams** — Generates Mermaid.js flowcharts, sequence diagrams, ER diagrams
- 💬 **Ask Your Docs (RAG)** — Chat with your documentation using AI
- 🌐 **VitePress Site** — Beautiful, searchable documentation website out of the box

## 🚀 Quick Start

```bash
# Install globally
npm install -g mvdoc

# Navigate to your project
cd my-project

# Initialize (interactive setup)
mvdoc init

# Generate documentation
mvdoc generate

# Preview locally
mvdoc serve

# Build for deployment
mvdoc build
```

## 📖 Commands

### `mvdoc init`

Interactive setup wizard that configures:
- Jira connection (host, project key, API token)
- GitHub connection (repository, access token)
- Gemini AI API key
- Documentation output directory

Creates `.mvdocrc.json` (config) and `.env` (secrets).

### `mvdoc generate`

Runs the full documentation pipeline:
1. **Aggregates** data from Jira, GitHub, and local codebase
2. **Processes** stories into technical specifications using AI
3. **Generates** Mermaid diagrams (architecture, data flow, sequence, ER)
4. **Creates** Markdown pages for VitePress

```bash
# Full generation
mvdoc generate

# Skip AI processing
mvdoc generate --skip-ai

# Skip diagram generation
mvdoc generate --skip-diagrams

# Preview without writing files
mvdoc generate --dry-run

# Only use specific sources
mvdoc generate --source local,github
```

### `mvdoc serve`

Starts a VitePress dev server to preview your documentation.

```bash
mvdoc serve
mvdoc serve --port 3000
mvdoc serve --no-open
```

### `mvdoc build`

Builds the VitePress site for production deployment.

```bash
mvdoc build
mvdoc build --out-dir ./public
```

### `mvdoc index`

Indexes documentation for the RAG chatbot (creates vector embeddings).

```bash
mvdoc index
mvdoc index --force  # Re-index all documents
```

### `mvdoc chat`

Chat with your documentation using AI.

```bash
# Interactive CLI chat
mvdoc chat

# Start API server for the web widget
mvdoc chat --serve
mvdoc chat --serve --port 3456
```

## ⚙️ Configuration

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
    "provider": "gemini",
    "model": "gemini-2.0-flash"
  }
}
```

### `.env` (Do NOT commit!)

```env
MVDOC_JIRA_EMAIL=your-email@company.com
MVDOC_JIRA_TOKEN=your-jira-api-token
MVDOC_GITHUB_TOKEN=ghp_your-github-token
MVDOC_GEMINI_KEY=AIza-your-gemini-key
```

## 🏗️ Generated Documentation Structure

```
docs/
├── index.md              # Homepage with project stats
├── overview.md           # AI-generated project overview
├── architecture/
│   └── index.md          # Diagrams (architecture, data flow, ER)
├── stories/
│   ├── index.md          # Story index with status table
│   ├── proj-1.md         # Individual story with tech spec
│   └── epic-proj-10.md   # Epic grouping page
├── modules/
│   ├── index.md          # Module index
│   └── auth.md           # AI-analyzed module documentation
└── .vitepress/
    ├── config.mts         # Auto-generated VitePress config
    └── theme/
        ├── index.ts       # Custom theme with ChatWidget
        ├── style.css      # Custom styles
        └── components/
            └── ChatWidget.vue  # RAG chat component
```

## 🤖 How AI is Used

| Feature | AI Model | Purpose |
|---------|----------|---------|
| Story → Spec | Gemini 2.0 Flash | Convert user stories to technical specs |
| Diagram Generation | Gemini 2.0 Flash | Generate Mermaid.js syntax |
| Module Analysis | Gemini 2.0 Flash | Analyze and document code modules |
| Project Overview | Gemini 2.0 Flash | Summarize the entire project |
| RAG Embeddings | text-embedding-004 | Create vector embeddings for search |
| Ask Your Docs | Gemini 2.0 Flash | Answer questions from doc context |

## 📝 License

MIT © Ameen
