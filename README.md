<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/eulogik/nexus/main/apps/nexus-desktop/src-tauri/icons/128x128.png">
  <img src="https://raw.githubusercontent.com/eulogik/nexus/main/apps/nexus-desktop/src-tauri/icons/128x128.png" width="120" alt="Nexus Logo">
</picture>

# **Nexus** — Universal Coding Agent Harness

### Zero Cost. Zero Dependencies. 100% Control.

[![Tests](https://img.shields.io/badge/tests-571%20passing-brightgreen?style=flat-square&logo=vitest)](./test)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict%20mode-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Rust](https://img.shields.io/badge/Rust-Tauri%20v2-orange?style=flat-square&logo=rust)](https://tauri.app/)
[![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)](./LICENSE)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Linux%20%7C%20Windows-lightgrey?style=flat-square)](#installation)

**The open-source coding agent that runs entirely on your machine — with free LLM routing, local micro-models, and a plugin system that doesn't compromise security.**

[Installation](#installation) · [Quick Start](#quick-start) · [Architecture](#architecture) · [Plugins](#plugins) · [Docs](./docs) · [Contributing](#contributing)

</div>

---

## ✨ Why Nexus?

| Feature | Nexus | Claude Code | Cursor | Copilot |
|---------|-------|-------------|--------|---------|
| **Cost** | Free by default | $20/mo | $20/mo | $10/mo |
| **Local micro-model** | ✅ 0.5B on-device | ❌ | ❌ | ❌ |
| **Prompt compression** | ✅ 30-60% savings | ❌ | ❌ | ❌ |
| **Git-native sessions** | ✅ Branch-per-session | ❌ | ❌ | ❌ |
| **Plugin sandbox** | ✅ isolated-vm | ❌ | ❌ | ❌ |
| **Offline capable** | ✅ | ❌ | ❌ | ❌ |
| **Multi-provider** | ✅ 300+ models | ❌ | ❌ | ❌ |
| **Desktop app** | ✅ Tauri v2 | ❌ | ✅ | ❌ |
| **Open source** | ✅ MIT | ❌ | ❌ | ❌ |

---

## 🚀 Quick Start

### Install

```bash
# npm
npm install -g nexus-ai

# Homebrew (macOS)
brew install nexus-ai

# Or run directly
npx nexus-ai init
```

### Set your API key (free tier works!)

```bash
nexus config set provider openrouter
nexus config set apiKey sk-or-v1-...
```

### Start coding

```bash
# Interactive TUI
nexus chat

# One-shot
nexus chat "Refactor this module to use async/await"

# Desktop app
nexus desktop
```

<details>
<summary><strong>🎥 See it in action</strong></summary>

```
$ nexus chat "Add error handling to auth.ts"

🔍 Analyzing auth.ts...
✏️  Editing auth.ts (3 changes)
🧪 Running tests... 12/12 passed ✅
📝 Committed: "Add error handling to auth.ts"
💰 Cost: $0.0004 (OpenRouter free tier)
```

</details>

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Nexus Desktop                            │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
│  │ Sidebar  │  │  Chat    │  │  Diff    │  │   Settings    │  │
│  │ Sessions │  │  View    │  │  Viewer  │  │   Modal       │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────┬────────┘  │
│       └──────────────┴─────────────┴───────────────┘            │
│                         React + Vite                            │
├─────────────────────────────────────────────────────────────────┤
│                     Tauri v2 (Rust)                             │
│  ┌────────────┐  ┌────────────┐  ┌────────────────────────┐    │
│  │  Session   │  │  Config    │  │  System Tray           │    │
│  │  Manager   │  │  Manager   │  │  Notifications         │    │
│  └────────────┘  └────────────┘  └────────────────────────┘    │
├─────────────────────────────────────────────────────────────────┤
│                     Nexus SDK (TypeScript)                      │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    Agent Loop (50 iter)                  │    │
│  │  ┌──────────┐  ┌──────────┐  ┌────────────────────┐    │    │
│  │  │  Tools   │  │  Git     │  │  Approval Checker  │    │    │
│  │  │  (7)     │  │  Manager │  │  (learned rules)   │    │    │
│  │  └──────────┘  └──────────┘  └────────────────────┘    │    │
│  └─────────────────────────────────────────────────────────┘    │
│  ┌────────────┐  ┌────────────┐  ┌────────────────────────┐    │
│  │  LLM API   │  │  Compress  │  │  Micro Model Router    │    │
│  │  (4 prov.) │  │  (30-60%)  │  │  (0.5B local)          │    │
│  └────────────┘  └────────────┘  └────────────────────────┘    │
├─────────────────────────────────────────────────────────────────┤
│                     Plugin SDK                                  │
│  ┌────────┐ ┌──────────┐ ┌────────┐ ┌──────┐ ┌─────────────┐  │
│  │  Git   │ │  GitHub  │ │ Docker │ │ MCP  │ │  Test       │  │
│  │  (7t)  │ │  (6t)    │ │  (6t)  │ │ (4t) │ │  (4t)       │  │
│  └────────┘ └──────────┘ └────────┘ └──────┘ └─────────────┘  │
│                    isolated-vm sandbox                          │
└─────────────────────────────────────────────────────────────────┘
```

### Monorepo Structure

```
nexus/
├── packages/
│   ├── nexus-ai/          # Multi-provider LLM API (OpenRouter, Anthropic, OpenAI, Google)
│   ├── nexus-core/        # Agent runtime — sessions, tools, loop, git
│   ├── nexus-compress/    # Prompt compression pipeline (30-60% savings)
│   ├── nexus-micro/       # 0.5B local micro-model for intent routing
│   ├── nexus-tui/         # Terminal UI (Ink + React)
│   └── nexus-plugin-sdk/  # Plugin development kit with sandbox
├── apps/
│   ├── nexus-cli/         # CLI entry point (yargs, 6 commands)
│   ├── nexus-desktop/     # Tauri v2 desktop app (Rust + React)
│   └── nexus-sdk/         # Programmatic API for embedding
├── plugins/
│   ├── nexus-plugin-git/       # Git operations (7 tools)
│   ├── nexus-plugin-github/    # GitHub PRs, issues, review (6 tools)
│   ├── nexus-plugin-docker/    # Container management (6 tools)
│   ├── nexus-plugin-mcp/       # MCP server integration (4 tools)
│   └── nexus-plugin-test/      # Test runner (4 tools)
└── docs/
    ├── architecture.md        # Deep-dive architecture
    ├── api-reference.md       # Full API documentation
    ├── plugin-development.md  # Plugin creation guide
    └── user-guide.md          # Installation & usage
```

---

## 🎯 Core Features

### 🤖 Multi-Provider LLM API
Route to **300+ models** through a single interface. OpenRouter free tier works out of the box.

```typescript
import { Nexus } from 'nexus-sdk';

const nexus = new Nexus({
  provider: 'openrouter',
  model: 'auto', // auto-routes to best free model
});

const response = await nexus.chat('session-id', 'Explain this code');
```

### 🧠 0.5B Local Micro-Model
Intent classification and complexity routing runs **entirely on-device**. No API calls for routing decisions.

```
User: "Fix the login bug"
→ Intent: code_fix (confidence: 0.94)
→ Complexity: medium → Route to: qwen-2.5-coder-7b
```

### 📦 Prompt Compression
Automatically compresses context by **30-60%** using content-aware strategies:

| Strategy | Savings | Best For |
|----------|---------|----------|
| SmartCrusher | 40-60% | JSON, API responses |
| CodeCompressor | 30-50% | Source code |
| ProseCompressor | 20-40% | Documentation, comments |
| Auto (ContentRouter) | 30-50% | Mixed content |

### 🌿 Git-Native Sessions
Every session gets its own **git branch**. Auto-commit on completion. Full history.

```
nexus-session-2024-06-23T14-30-00-a1b2c3d4
  → "Add error handling to auth.ts"
  → "Fix edge case in token validation"
  → "Add tests for auth module"
```

### 🔒 Plugin Sandbox
Plugins run in **isolated-vm** with 128MB heap, 5-second timeout, and zero access to host APIs unless explicitly permitted.

```json
{
  "name": "my-plugin",
  "permissions": ["fs:read", "network:fetch"],
  "sandbox": {
    "memoryLimit": 128,
    "timeout": 5000
  }
}
```

### 💻 Desktop App
Beautiful Tauri v2 desktop app with system tray, streaming chat, diff viewer, and keyboard shortcuts.

---

## 🔌 Plugins

| Plugin | Tools | Description |
|--------|-------|-------------|
| **Git** | 7 | Status, log, diff, commit, branch, push, pull |
| **GitHub** | 6 | PRs, issues, code review |
| **Docker** | 6 | PS, images, run, stop, logs, build |
| **MCP** | 4 | Connect, list tools, call tool, disconnect |
| **Test** | 4 | Detect framework, run, run file, watch |

Create your own:

```bash
nexus plugin create my-plugin
```

See [Plugin Development Guide](./docs/plugin-development.md) for details.

---

## 📊 Performance

| Metric | Value |
|--------|-------|
| CLI cold start | < 200ms |
| Compression speed | > 10MB/s |
| Agent loop | 50 iterations max |
| Memory footprint | < 150MB (desktop) |
| Binary size | ~18MB (desktop) |
| Test coverage | 571 tests, 40 files |

---

## 🛠️ Installation

### Prerequisites
- Node.js >= 20.18.0
- pnpm >= 9.0.0

### From npm
```bash
npm install -g nexus-ai
```

### From source
```bash
git clone https://github.com/eulogik/nexus.git
cd nexus
pnpm install
pnpm build
pnpm nexus init
```

### Desktop app
```bash
# macOS
brew install --cask nexus-desktop

# Or download from Releases
```

---

## 📖 Documentation

| Document | Description |
|----------|-------------|
| [User Guide](./docs/user-guide.md) | Installation, configuration, usage |
| [Architecture](./docs/architecture.md) | Package dependencies, data flow, security |
| [API Reference](./docs/api-reference.md) | SDK methods, CLI commands, config schema |
| [Plugin Development](./docs/plugin-development.md) | Create and publish plugins |

---

## 🧪 Testing

```bash
# All tests
pnpm test

# Specific package
pnpm --filter nexus-core test

# With coverage
pnpm test -- --coverage
```

**571 tests passing** across 40 test files.

---

## 🤝 Contributing

We welcome contributions! See our [Contributing Guide](./CONTRIBUTING.md) for details.

```bash
# Fork and clone
git clone https://github.com/YOUR_USERNAME/nexus.git

# Install dependencies
pnpm install

# Run tests
pnpm test

# Build all packages
pnpm build

# Lint
pnpm lint
```

---

## 📜 License

MIT © [Eulogik](https://github.com/eulogik)

---

<div align="center">

**⭐ Star this repo if you find it helpful!**

[Report Bug](https://github.com/eulogik/nexus/issues) · [Request Feature](https://github.com/eulogik/nexus/issues) · [Discussions](https://github.com/eulogik/nexus/discussions)

Made with ❤️ by [Eulogik](https://github.com/eulogik)

</div>
