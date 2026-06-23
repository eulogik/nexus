# Nexus User Guide

## Installation

### npm

```bash
npm install -g nexus-cli
```

### Homebrew (macOS / Linux)

```bash
brew install nexus-cli
```

### Scoop (Windows)

```bash
scoop bucket add nexus https://github.com/nexus/scoop-bucket
scoop install nexus
```

### Pre-built Binaries

Download the latest release for your platform from the [releases page](https://github.com/nexus/nexus/releases).

### Build from Source

```bash
git clone https://github.com/nexus/nexus.git
cd nexus
pnpm install
pnpm build
pnpm link --global
```

---

## Quick Start

```bash
# Initialize a new project
nexus init my-project
cd my-project

# Configure your API key
nexus config set provider openrouter
nexus config set apiKey sk-...

# Start a chat session
nexus chat

# Run a single command
nexus chat "Explain how monads work"
```

---

## Configuration Guide

### Configuration File

Nexus reads configuration from `nexus.json` in the current directory, or `~/.nexus/config.json` for global settings.

### Commands

```bash
# View current config
nexus config

# Get a specific value
nexus config get provider

# Set a value
nexus config set model claude-sonnet-4-20250514

# Set a value globally
nexus config set --global apiKey sk-...

# Export config as JSON
nexus config --json
```

### Key Configuration Options

| Key | Description |
|-----|-------------|
| `provider` | LLM provider (`openrouter`, `openai`, `anthropic`, `google`) |
| `model` | Model identifier or `"auto"` for automatic selection |
| `temperature` | Response creativity (0-2, default: 0.7) |
| `maxTokens` | Maximum response tokens (default: 4096) |

---

## Session Management

Sessions persist conversation history and context.

```bash
# List sessions
nexus session list

# Show current session
nexus session show

# Switch to a different session
nexus session switch <id>

# Delete a session
nexus session delete <id>

# Fork the current session into a new one
nexus session fork

# Create a named session
nexus chat --session my-feature-work
```

### Git Integration

When `session.branchPerSession` is enabled (default), each session creates a git branch:

```
main        ──► feature-x (session)
  └── fix-y (session)
```

This allows you to keep changes organized and experiment freely.

---

## Cost Management

### Setting Budgets

```bash
# Set a monthly budget cap ($10)
nexus config set budget.monthly 10

# Set a warning threshold ($8)
nexus config set budget.warning 8
```

### Viewing Usage

```bash
# Show current session cost
nexus chat --show-cost

# View overall usage
nexus doctor --usage
```

Nexus tracks token usage and cost per session and per month. When the warning threshold is reached, you'll see a notification. When the cap is reached, requests are blocked.

---

## Compression Settings

Compression reduces prompt size to save tokens and costs.

```bash
# Enable/disable compression
nexus config set compression.enabled true

# Set compression strategy
nexus config set compression.strategy auto
# Options: auto, smartcrusher, code, prose, none

# Set minimum compression ratio (0.0 - 1.0)
nexus config set compression.minRatio 0.5
```

### Compression Strategies

| Strategy | Best For | Typical Savings |
|----------|----------|----------------|
| `smartcrusher` | JSON data | 40-60% |
| `code` | Source code | 30-50% |
| `prose` | Natural language | 20-40% |
| `auto` | Mixed content | 30-50% |

---

## Git Integration

Nexus uses git branches to isolate session changes.

```bash
# Check current session branch
git branch

# Diff session changes
nexus chat "Show me what changed"

# Merge session back to main
git checkout main
git merge feature-x
```

### Auto-Commit

Each turn in a session is automatically committed to the session branch with descriptive messages. You can disable this:

```bash
nexus config set session.autoCommit false
```

---

## Plugin Management

```bash
# List installed plugins
nexus plugin list

# Install a plugin
nexus plugin install nexus-plugin-git

# Install from local path
nexus plugin install ./plugins/my-plugin

# Enable a plugin
nexus config set plugins.enabled '["git", "mcp"]'

# Disable a plugin
nexus plugin disable git

# Remove a plugin
nexus plugin remove nexus-plugin-git
```

### Official Plugins

| Plugin | Description |
|--------|-------------|
| `git` | Git operations (commit, branch, diff, log) |
| `mcp` | Model Context Protocol integration |
| `github` | GitHub API operations |
| `docker` | Docker container management |
| `test` | Test runner integration |

---

## Troubleshooting

### Diagnostics

```bash
# Run system diagnostics
nexus doctor

# Auto-fix common issues
nexus doctor --fix
```

### Common Issues

**"API key not configured"**
Run `nexus config set apiKey <your-key>` or set the `OPENROUTER_API_KEY` environment variable.

**"Provider rate limit exceeded"**
Wait a moment or switch to a different provider: `nexus config set provider anthropic`

**"Plugin sandbox error"**
Check plugin permissions in `manifest.json`. Some operations require explicit permission grants.

**"Compression is degrading quality"**
Disable compression: `nexus config set compression.enabled false`, or switch strategy: `nexus config set compression.strategy none`

**"Session not found"**
List available sessions with `nexus session list` and switch to a valid one.

### Logs

```bash
# Enable verbose logging
nexus --verbose chat

# Set log level via environment variable
NEXUS_LOG_LEVEL=debug nexus chat
```

---

## FAQ

**Q: Is Nexus free?**
A: Nexus itself is free and open source. You pay only for LLM API usage through your chosen provider.

**Q: Can I use Nexus offline?**
A: Partial offline support is available via nexus-micro for intent classification. Full LLM responses require API access.

**Q: Does Nexus share my data?**
A: No. All data stays local. API calls go directly to your configured LLM provider. Nexus does not collect telemetry.

**Q: What models are supported?**
A: Any model available through OpenRouter, OpenAI, Anthropic, or Google. You can also use local models via node-llama-cpp.

**Q: Can I contribute a plugin?**
A: Yes! See the [Plugin Development Guide](./plugin-development.md) for details.
