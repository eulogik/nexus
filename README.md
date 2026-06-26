<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/eulogik/nexus/main/apps/nexus-desktop/src-tauri/icons/128x128.png">
  <img src="https://raw.githubusercontent.com/eulogik/nexus/main/apps/nexus-desktop/src-tauri/icons/128x128.png" width="120" alt="Nexus Logo">
</picture>

# **Nexus** — AI Coding Agent Desktop App

### Free. Local. Open Source. The coding agent that actually builds things.

[![Tests](https://img.shields.io/badge/tests-571%20passing-brightgreen?style=flat-square&logo=vitest)](./test)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict%20mode-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Rust](https://img.shields.io/badge/Rust-Tauri%20v2-orange?style=flat-square&logo=rust)](https://tauri.app/)
[![License](https://img.shields.io/badge/license-Mit-green?style=flat-square)](./LICENSE)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Linux%20%7C%20Windows-lightgrey?style=flat-square)](#installation)
[![Stars](https://img.shields.io/github/stars/eulogik/nexus?style=flat-square&logo=github&color=yellow)](https://github.com/eulogik/nexus/stargazers)
[![Downloads](https://img.shields.io/github/downloads/eulogik/nexus/total?style=flat-square&logo=github&color=blue)](https://github.com/eulogik/nexus/releases)

**An AI coding agent that runs on your machine, connects to 300+ LLMs, and actually writes code — not just chat about it. Built with Rust + TypeScript. 100% open source.**

[Install](#installation) · [Quick Start](#quick-start) · [Features](#features) · [Architecture](#architecture) · [Plugins](#plugins) · [Docs](./docs) · [Discord](https://discord.gg/nexus)

</div>

---

## Why Nexus?

Most AI coding tools are expensive cloud services that can't actually execute code. Nexus is different — it runs on your machine, has full file system access, executes shell commands, and manages git branches. All for **free**.

| Feature | Nexus | Claude Code | Cursor | Copilot |
|---------|-------|-------------|--------|---------|
| **Cost** | Free by default | $20/mo (Pro) | $20/mo (Pro) | $10/mo |
| **Runs locally** | ✅ Full desktop app | ✅ Terminal | ❌ VS Code only | ❌ Cloud only |
| **Code execution** | ✅ Read, write, edit, bash | ✅ | Limited | ❌ |
| **Git branching** | ✅ Branch-per-session | ❌ | ❌ | ❌ |
| **Multi-provider** | ✅ 300+ models | ❌ Claude only | ❌ | ❌ |
| **Free models** | ✅ OpenRouter auto | ❌ | ❌ | ❌ |
| **Plugin system** | ✅ Sandboxed | ❌ | Extensions | ❌ |
| **Micro-models** | ✅ 0.5B on-device | ❌ | ❌ | ❌ |
| **Prompt compression** | ✅ 30-60% savings | ❌ | ❌ | ❌ |
| **Offline capable** | ✅ | ❌ | ❌ | ❌ |
| **Open source** | ✅ MIT | ❌ | ❌ | ❌ |

---

## What Can Nexus Do?

### Actually Build Things
Nexus doesn't just suggest code — it **executes tools** to read files, write code, run commands, and manage your project:

```
You: "Build a Next.js blog with admin panel and SEO"
Nexus: ✓ Creates package.json
       ✓ Creates Next.js config
       ✓ Creates admin page with auth
       ✓ Creates frontend with responsive design
       ✓ Generates SEO meta tags
       ✓ Runs npm install
       ✓ Shows git diff of all changes
```

### Work With Any LLM
Connect to OpenRouter (300+ models, free tier), Anthropic, OpenAI, or Google. Auto-routes to the best free model.

### Multi-Turn Agent Loop
Nexus runs up to 50 iterations of: think → use tools → observe results → think again. It can explore your codebase, read files, make edits, run tests, and fix issues — all automatically.

### Git-Native Sessions
Every conversation gets its own git branch. Changes are tracked, reversible, and never lose your work.

---

## Screenshots

<div align="center">

| Chat Interface | Code Execution | Diff Viewer |
|:---:|:---:|:---:|
| ![Chat](https://raw.githubusercontent.com/eulogik/nexus/main/docs/screenshots/chat.png) | ![Tools](https://raw.githubusercontent.com/eulogik/nexus/main/docs/screenshots/tools.png) | ![Diff](https://raw.githubusercontent.com/eulogik/nexus/main/docs/screenshots/diff.png) |

</div>

---

## Quick Start

### Option 1: Download Desktop App

**[⬇️ Download for macOS](https://github.com/eulogik/nexus/releases/latest)** (Apple Silicon / Intel)

**[⬇️ Download for Windows](https://github.com/eulogik/nexus/releases/latest)**

**[⬇️ Download for Linux](https://github.com/eulogik/nexus/releases/latest)** (.deb / .AppImage)

### Option 2: Build From Source

```bash
# Clone
git clone https://github.com/eulogik/nexus.git
cd nexus

# Install
pnpm install

# Run desktop app
pnpm --filter nexus-desktop tauri dev

# Or run CLI
pnpm nexus init
pnexus chat
```

### First Run

1. Open Nexus → Click **"Add Project"** → Select a folder
2. Start chatting: *"Build something awesome"*
3. Nexus will create files, run commands, and show you a diff

> **Free tier works!** Nexus auto-routes to free OpenRouter models. No API key needed for basic usage.

---

## Installation

### Desktop App (Recommended)

| Platform | Method |
|----------|--------|
| **macOS** | `brew install --cask nexus` or download `.dmg` from [Releases](https://github.com/eulogik/nexus/releases) |
| **Windows** | Download `.msi` from [Releases](https://github.com/eulogik/nexus/releases) |
| **Linux** | Download `.deb` or `.AppImage` from [Releases](https://github.com/eulogik/nexus/releases) |
| **Any** | `git clone` + `pnpm --filter nexus-desktop tauri dev` |

### CLI

```bash
# npm
npm install -g nexus

# Homebrew
brew install nexus

# pnpm
pnpm add -g nexus
```

---

## Features

### 🤖 Agent Loop (50 Iterations)
Multi-step reasoning with tool use. The agent can explore code, make changes, run tests, and fix issues — all in one request.

### 🛠️ 7 Built-in Tools
- **read** — Read file contents
- **write** — Create or overwrite files
- **edit** — Surgical text replacement
- **bash** — Execute shell commands
- **glob** — Find files by pattern
- **grep** — Search with regex

### 🌿 Git Operations
- **stage_file** — Stage changes
- **unstage_file** — Unstage changes
- **discard_changes** — Discard unstaged changes
- **list_unstaged_files** — List modified files

### 💬 Streaming Chat
Real-time token streaming with markdown rendering, syntax-highlighted code blocks, and tool execution badges.

### 🔍 Diff Viewer
Full project git diff with color-coded additions/removals, file staging, and discard capabilities.

### 📊 Cost Tracking
Token usage and estimated cost displayed in real-time.

### 🔌 Plugin System
Extensible with sandboxed plugins:
- **Git** — 7 tools (status, log, diff, commit, branch, push, pull)
- **GitHub** — 6 tools (PRs, issues, review)
- **Docker** — 6 tools (ps, images, run, stop, logs, build)
- **MCP** — 4 tools (connect, list, call, disconnect)
- **Test** — 4 tools (detect, run, run file, watch)

### 0.5B Local Micro-Model
Intent classification runs on-device for instant routing.

### 📦 Prompt Compression
30-60% context savings with content-aware compression.

### 🖥️ Tauri v2 Desktop
Native macOS/Windows/Linux app with system tray, notifications, and keyboard shortcuts.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Nexus Desktop                            │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
│  │ Sidebar  │  │  Chat    │  │  Diff    │  │   Settings    │  │
│  │ Sessions │  │  View    │  │  Viewer  │  │   Modal       │  │
│  │ Files    │  │          │  │          │  │               │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────┬────────┘  │
│       └──────────────┴─────────────┴───────────────┘            │
│                         React + Vite                            │
├─────────────────────────────────────────────────────────────────┤
│                     Tauri v2 (Rust)                             │
│  ┌────────────┐  ┌────────────┐  ┌────────────────────────┐    │
│  │  Session   │  │  Config    │  │  Bridge Script (Node)  │    │
│  │  Manager   │  │  Manager   │  │  Agent Loop + Tools    │    │
│  └────────────┘  └────────────┘  └────────────────────────┘    │
├─────────────────────────────────────────────────────────────────┤
│                     Nexus SDK (TypeScript)                      │
│  ┌────────────┐  ┌────────────┐  ┌────────────────────────┐    │
│  │  LLM API   │  │  Compress  │  │  Micro Model Router    │    │
│  │  (4 prov.) │  │  (30-60%)  │  │  (0.5B local)          │    │
│  └────────────┘  └────────────┘  └────────────────────────┘    │
├─────────────────────────────────────────────────────────────────┤
│                     Plugin SDK                                  │
│  ┌────────┐ ┌──────────┐ ┌────────┐ ┌──────┐ ┌─────────────┐  │
│  │  Git   │ │  GitHub  │ │ Docker │ │ MCP  │ │  Custom     │  │
│  └────────┘ └──────────┘ └────────┘ └──────┘ └─────────────┘  │
│                    isolated-vm sandbox                          │
└─────────────────────────────────────────────────────────────────┘
```

### Monorepo Structure

```
nexus/
├── packages/
│   ├── nexus-ai/          # Multi-provider LLM API
│   ├── nexus-core/        # Agent runtime
│   ├── nexus-compress/    # Prompt compression
│   ├── nexus-micro/       # Local micro-models
│   ├── nexus-tui/         # Terminal UI
│   └── nexus-plugin-sdk/  # Plugin SDK
├── apps/
│   ├── nexus-desktop/     # Tauri v2 desktop app
│   ├── nexus-cli/         # CLI
│   └── nexus-sdk/         # Programmatic API
├── plugins/
│   ├── nexus-plugin-git/
│   ├── nexus-plugin-github/
│   ├── nexus-plugin-docker/
│   ├── nexus-plugin-mcp/
│   └── nexus-plugin-test/
└── docs/
```

---

## Performance

| Metric | Value |
|--------|-------|
| CLI cold start | < 200ms |
| Compression speed | > 10MB/s |
| Agent loop | 50 iterations |
| Memory | < 150MB |
| Binary size | ~18MB |
| Tests | 571 passing, 40 files |

---

## Project Structure

```
nexus/
├── apps/nexus-desktop/     # Desktop app (Tauri + React)
│   ├── src/                 # React frontend
│   ├── src-tauri/           # Rust backend
│   │   ├── src/lib.rs       # Main Rust code
│   │   └── icons/           # App icons
│   ├── package.json
│   └── tauri.conf.json
├── apps/nexus-cli/         # CLI tool
├── packages/nexus-core/    # Core SDK
├── packages/nexus-ai/      # LLM providers
├── packages/nexus-compress/ # Compression engine
├── packages/nexus-tui/      # Terminal UI
├── plugins/                 # Official plugins
├── docs/                    # Documentation
├── package.json
├── pnpm-workspace.yaml
└── turbo.json
```

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| **Frontend** | React 19 + Vite + Tailwind | Fast, modern UI |
| **Backend** | Rust + Tauri v2 | Native performance, small binary |
| **LLM** | OpenRouter + custom bridge | 300+ models, free tier |
| **State** | Zustand (implied) | Lightweight |
| **Testing** | Vitest | Fast TypeScript tests |
| **Build** | Turborepo + pnpm | Monorepo orchestration |
| **CI** | GitHub Actions | Automated testing |

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `⌘K` / `Ctrl+K` | Open command palette |
| `⌘B` / `Ctrl+B` | Toggle sidebar |
| `⌘W` | Close file / session |
| `Esc` | Close modals |
| `Enter` | Send message |
| `Shift+Enter` | New line |

---

## Links

- **[Official Website](https://nexus.ai)** — Product info & pricing
- **[Documentation](https://docs.nexus.ai)** — Full guides & API reference
- **[Discord Community](https://discord.gg/nexus)** — Get help & share ideas
- **[Twitter/X](https://twitter.com/nexus_ai)** — Updates & announcements
- **[YouTube](https://youtube.com/@nexus-ai)** — Tutorials & demos
- **[Blog](https://nexus.ai/blog)** — Engineering deep-dives
- **[Changelog](https://github.com/eulogik/nexus/releases)** | See what's new
- **[Roadmap](https://github.com/eulogik/nexus/projects)** | What we're building
- **[Discussions](https://github.com/eulogik/nexus/discussions)** | Community Q&A
- **[Wiki](https://github.com/eulogik/nexus/wiki)** | Additional resources

---

## Release Package

### Latest Release: v1.1.0

**[View on GitHub Releases →](https://github.com/eulogik/nexus/releases/tag/v1.1.0)**

**Desktop Downloads:**
- macOS (Apple Silicon): `nexus-desktop-aarch64.dmg` (18MB)
- macOS (Intel): `nexus-desktop-x64.dmg` (18MB)
- Windows: `nexus-desktop-x64.msi` (16MB)
- Linux: `nexus-desktop-amd64.deb` / `.AppImage` (20MB)

```bash
# Verify checksums
curl -sL https://github.com/eulogik/nexus/releases/download/v1.1.0/SHASUMS256.txt | sha256sum -c -

# Homebrew
brew install --cask nexus

# Snap (Linux)
sudo snap install nexus

# Cargo
cargo install nexus-desktop
```

**Also available as:**
- npm package: `npm install -g nexus`
- Docker image: `docker pull ghcr.io/eulogik/nexus:latest`
- Standalone binary: Direct download from releases

---

## Try It Now

```bash
# Quick demo (no install)
npx nexus-ai chat "Create a hello world in React"

# Full experience
git clone https://github.com/eulogik/nexus.git
cd nexus && pnpm install && pnpm --filter nexus-desktop tauri dev
```

---

## Contributing

We welcome contributions! Areas we need help with:
- Bug fixes and test coverage
- New provider integrations
- Plugin development
- Documentation translations
- Feature requests & feedback

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

```bash
# Development setup
git clone https://github.com/eulogik/nexus.git
cd nexus
pnpm install
pnpm test
pnpm --filter nexus-desktop tauri dev
```

---

## License

MIT © [Eulogik](https://github.com/eulogik)

---

<div align="center">

**⭐ Star this repo if you find it helpful!**

[![GitHub stars](https://img.shields.io/github/stars/eulogik/nexus?style=social)](https://github.com/eulogik/nexus/stargazers)

[Report Bug](https://github.com/eulogik/nexus/issues) · [Request Feature](https://github.com/eulogik/nexus/issues) · [Discussions](https://github.com/eulogik/nexus/discussions) · [Docs](https://github.com/eulogik/nexus/wiki)

Made with ❤️ by the [Eulogik](https://github.com/eulogik) team

[Website](https://nexus.ai) · [Twitter](https://twitter.com/nexus_ai) · [Discord](https://discord.gg/nexus) · [Blog](https://nexus.ai/blog) · [Careers](https://nexus.ai/careers)

</div>
