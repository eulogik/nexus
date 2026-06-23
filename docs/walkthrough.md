# Nexus Walkthrough

## Current Phase: Phase 2 — Compression + Plugins (Complete)
## Last Updated: 2026-06-23 12:30 UTC

### Project Overview
Nexus is a universal coding agent harness — a drop-in replacement for Claude Code, Codex, Cursor, and OpenCode. It costs $0 by default (free OpenRouter models), requires zero external dependencies (embedded 0.5B micro-model), and gives developers complete control.

### Completed (Phase 1 — Foundation)

#### Monorepo Scaffold
- [x] Root config: package.json, tsconfig.base.json, turbo.json, pnpm-workspace.yaml, vitest.config.ts
- [x] Biome for linting/formatting, Zod for schema validation
- [x] 9 workspace packages: 6 packages + 2 apps + plugins directory

#### nexus-ai — Multi-Provider LLM API
- [x] AbstractProvider base class with retry, timeout, auth, cost estimation
- [x] OpenRouterProvider — primary provider with free model routing
- [x] AnthropicProvider — direct Anthropic API (Claude)
- [x] OpenAIProvider — direct OpenAI API (GPT-4o, etc.)
- [x] GoogleProvider — direct Google AI Studio API (Gemini)
- [x] ProviderRegistry — model selection, provider registration, fallback chains
- [x] CircuitBreaker — 5-failure threshold, 60s timeout, half-open recovery
- [x] CostTracker — per-session/daily/monthly tracking, budget enforcement
- [x] RateLimiter — token bucket, priority queue, exponential backoff with jitter

#### nexus-core — Agent Runtime
- [x] SessionManager — CRUD sessions as JSON files in `.nexus/sessions/`
- [x] ConfigManager — loads `~/.nexus/config.json`, env var overrides, deep merge
- [x] Tool implementations: read, write, edit, bash, glob, grep, search
- [x] ApprovalChecker — learned rules with persistence, pattern matching, confidence decay
- [x] GitManager — branch-per-session, auto-commit with templates, merge/squash/rebase
- [x] AgentLoop — 50-iteration loop, micro-model routing, system prompt composition, compression integration
- [x] Error system — ErrorCode enum, NexusError class, recovery matrix, withRetry

#### nexus-micro — 0.5B Local Router
- [x] MicroModelRouter — node-llama-cpp integration, model download with progress
- [x] RuleBasedRouter — regex intent detection, complexity scoring, model tier selection
- [x] MicroModelEngine — wraps getLlama/LlamaChatSession, system prompt routing
- [x] Validator — full RoutingDecision validation with descriptive errors
- [x] Always falls back to rule-based when ML model unavailable

#### nexus-compress — Compression Pipeline
- [x] SmartCrusher — JSON compression (array→keys/rows, null pruning, string truncation)
- [x] CodeCompressor — comment stripping for TS/JS/Python/Go/Rust/Java/C++
- [x] ProseCompressor — newline collapsing, aggressive stop word removal
- [x] ContentRouter — strategy selection, maxCompressionRatio enforcement
- [x] CacheAligner — DJB2-hashed prefix matching for KV cache hits
- [x] TokenCounter — byte-aware token estimation

#### nexus-tui — Terminal UI (Ink + React)
- [x] NexusApp — main layout with header, message list, input bar, status bar
- [x] Header — logo, session info, cost display
- [x] MessageList — scrollable, color-coded roles, code highlighting, collapsible tools
- [x] InputBar — text input with char count, spinner, multi-line support
- [x] StatusBar — status, model, cost, savings, keyboard shortcuts
- [x] CostPanel — session/daily/monthly cost breakdown, budget bar, compression savings
- [x] ApprovalDialog — tool call approval with Y/N/A keys
- [x] runInkApp — standalone entry for Ink rendering
- [x] Utility functions: formatTokens, formatCost, formatTime, truncate, stripAnsi, highlightCode

#### nexus-plugin-sdk — Plugin System
- [x] PluginManifest type and validation
- [x] PluginStorageProvider — in-memory Map with optional file persistence
- [x] EventEmitter — on/off/emit/once, predefined events
- [x] PluginSandbox — isolated-vm integration with fallback Function-based sandbox
- [x] PluginLoader — dynamic import, tool registration, context wiring
- [x] Security: dangerous command blocking, private IP blocking, path validation

#### nexus-cli — Command-Line Interface
- [x] yargs-based CLI with 6 commands
- [x] `nexus init` — creates `.nexus/` directory structure and default config
- [x] `nexus chat` — interactive chat with Ink TUI (falls back to readline with --no-tui)
- [x] `nexus config` — get/set/list/edit/reset subcommands
- [x] `nexus doctor` — checks Node >=20.18, git, config, API keys
- [x] `nexus sessions` — list/show/delete/export sessions
- [x] `nexus fork` — fork session from specific message

#### nexus-sdk — Programmatic API
- [x] Nexus class with 10 methods: createSession, chat (streaming), getSession, listSessions, deleteSession, getCost, getConfig, updateConfig, runTool, runTask
- [x] Event emitter for session lifecycle events
- [x] Re-exports all types from nexus-core and nexus-ai

#### Docs & Scripts
- [x] docs/walkthrough.md — this living document
- [x] docs/architecture.md — package dependencies, data flow, security model
- [x] docs/api-reference.md — SDK, CLI, Plugin API, config schema
- [x] docs/plugin-development.md — plugin creation guide with example
- [x] docs/user-guide.md — installation, quick start, configuration
- [x] scripts/build.ts — build orchestrator
- [x] scripts/test.ts — test runner with coverage
- [x] scripts/benchmark.ts — compression and CLI benchmarks
- [x] scripts/release.ts — version bump and tag creation
- [x] scripts/download-model.ts — model download from HuggingFace with progress

#### Configuration
- [x] Default config.json with all sections (providers, micro-model, budget, approval, compression, git, plugins, ui, logging)
- [x] Environment variable overrides (NEXUS_OPENROUTER_API_KEY, etc.)
- [x] API key storage via system keychain (keytar) or AES-256-GCM encrypted files
- [x] AGENTS.md / CLAUDE.md / .cursorrules / .nexus.md compatibility

### Completed (Phase 2 — Compression + Plugins)

#### Desktop App (Phase 3 v1.1)
- [x] Tauri v2 project scaffolded (Rust backend + React frontend)
- [x] Rust backend: 9 Tauri commands, system tray, close-to-tray, global shortcuts
- [x] React frontend: App shell with Tailwind CSS dark theme
- [x] Sidebar — collapsible session tree with date grouping, status dots, quick actions
- [x] ChatView — message list with streaming, markdown rendering, syntax-highlighted code blocks
- [x] InputBar — auto-resizing textarea, Cmd+Enter send, cost estimate, model selector
- [x] SessionView — 5-section details panel (info, model, cost breakdown, messages, actions)
- [x] DiffViewer — side-by-side unified diff with scroll sync, syntax highlighting
- [x] StatusBar — pulsing status, model, cost badge, clock
- [x] SettingsModal — 3 tabs (General, Providers, About), API key management, test connection
- [x] Toast notification system — 4 types, auto-dismiss, stackable
- [x] Command palette (Cmd+K) — fuzzy search, keyboard navigable
- [x] Keyboard shortcuts modal — all shortcuts grouped and documented
- [x] nexus-sdk integration hook with Tauri IPC bridge
- [x] Icon generation script (Python + ImageMagick fallback)

#### Unit Testing (448 tests originally)
- [x] nexus-ai: 77 tests — CircuitBreaker, CostTracker, RateLimiter, Provider, Registry, all 4 provider impls
- [x] nexus-core: 151 tests — Error, Config, Tools, SessionManager, Approval, GitManager, AgentLoop
- [x] nexus-compress: 76 tests — TokenCounter, SmartCrusher, CodeCompressor, ProseCompressor, ContentRouter, CacheAligner
- [x] nexus-micro: 67 tests — Validator, RuleBasedRouter, MicroModelRouter
- [x] nexus-plugin-sdk: 41 tests — Manifest, Storage, Events, Sandbox
- [x] nexus-tui: 24 tests — Utils, Types
- [x] nexus-sdk: 12 tests — Nexus class

#### Integration Testing
- [x] Agent loop E2E — write → read → bash → edit cycle via mocked provider
- [x] Compression pipeline — all 3 compressors + CacheAligner + ContentRouter composition
- [x] Configuration — disk loading, merging, env var overrides, lifecycle

#### CI/CD
- [x] GitHub Actions workflow: lint & typecheck, test (4 shards), build, CLI smoke test
- [x] Concurrency grouping, fail-fast off for sharded tests
- [x] Summary table in CI output

#### Official Plugins (5/5)
- [x] nexus-plugin-git — 7 tools (status, log, diff, commit, branch, push, pull), real git CLI
- [x] nexus-plugin-mcp — 4 tools (connect, list tools, call tool, disconnect), JSON-RPC MCP protocol
- [x] nexus-plugin-github — 6 tools (list/get/create PR, list/create issues, review PR), GitHub REST API
- [x] nexus-plugin-docker — 6 tools (ps, images, run, stop, logs, build), Docker CLI
- [x] nexus-plugin-test — 4 tools (detect framework, run tests, run file, watch), auto-detect vitest/jest/mocha/ava/tape/node:test

#### Infrastructure
- [x] .gitignore for Node, dist, .nexus, macOS files
- [x] isolated-vm made optional (falls back to Function-based sandbox)
- [x] All 40 packages/apps/plugins compile with `tsc` (zero errors)
- [x] pnpm@9.15.4, engine requirement Node >=20.18.0
- [x] Full test suite: 571 tests across 40 files — all passing
- [x] Git repository initialized on main branch, first commit

### In Progress
- [ ] Model download: Qwen 0.5B requires HuggingFace token (HF_TOKEN env var). Try: `HF_TOKEN=hf_xxx pnpm tsx scripts/download-model.ts`
- [ ] Benchmark suite against Claude Code, Codex, Cursor baselines
- [x] Desktop app (Tauri v2) — scaffolded and built
- [ ] IDE extensions (VS Code, JetBrains)

### Blocked
- isolated-vm native compilation on Node 24 (needs C++20 toolchain) — uses fallback sandbox, works but less secure
- Qwen3.5 model on HuggingFace requires authentication — provide HF_TOKEN or use `smollm2-360m-instruct-q4_k_m` (MIT, no auth)

### Decisions Made
| Decision | Rationale |
|----------|-----------|
| TypeScript strict mode everywhere | Maximum type safety for agent tooling |
| ESM-only modules (no CommonJS) | Modern Node.js, aligns with Ink/React ecosystem |
| pnpm + Turborepo | Fast installs, workspace protocol, build caching |
| node-llama-cpp for local inference | Embedded (no Ollama), GPU support, prebuilt binaries |
| isolated-vm for plugins | True V8 isolation (fallback: Function sandbox) |
| Ink + React for TUI | Familiar component model, rerender optimization |
| yargs for CLI | Battle-tested, subcommand support, auto-help |
| Vitest over Jest | ESM-native, faster, TypeScript-first |
| Tauri v2 for desktop | ~6MB binary, Rust backend, web frontend, system tray, native notifications |
| JSON sessions in .nexus/sessions/ | Portable, inspectable, git-ignored by default |
| OpenRouter as default provider | 300+ models, free tier, single API key |

### Technical Debt
- [ ] Integration test for full agent loop with mocked provider
- [ ] Benchmark suite against known baselines
- [ ] Plugin examples for all 5 official plugins
- [ ] CLI autocomplete for bash/zsh
- [ ] Performance optimization for large sessions (>1000 messages)
- [ ] Parallel subagent execution with Git worktrees (v1.1)
- [ ] MCP server integration (v1.1)

### Next Steps
1. Write integration tests for full agent loop (read → write → bash → edit cycle)
2. Create example plugins (start with nexus-plugin-git)
3. Run `nexus doctor` to verify the environment
4. Set `NEXUS_OPENROUTER_API_KEY` and test `nexus chat` with a real model
5. Run `pnpm run benchmark` to get baseline numbers
6. Download the micro-model: `tsx scripts/download-model.ts`
7. Set up automated dependency updates (Renovate/Dependabot)

### Architecture Notes
- All packages follow clean architecture: types → implementation → export
- nexus-core orchestrates all other packages via dependency injection
- nexus-ai handles ALL LLM communication — no direct API calls from core
- Plugin sandbox uses isolated-vm for true V8 isolation (falls back to Function sandbox when unavailable)
- Session persistence: JSON files in `.nexus/sessions/`, one file per session
- Git integration: branch-per-session (`nexus/{name}-{date}`), auto-commit on completion
- Compression: ContentRouter selects strategy by content type, enforces max ratio
- Routing: MicroModelRouter tries local ML first, falls back to regex-based RuleBasedRouter
- API keys: stored encrypted (AES-256-GCM) or via OS keychain (`keytar`)

### API Changes
- None yet — all APIs are initial v1.0 implementations

### Performance Notes
- Micro-model: ~300MB disk (Q4_K_M), ~400MB RAM, 30-50 t/s on CPU, 100+ t/s on GPU
- CLI cold start target: <500ms
- Tool call (local): <100ms
- Compression: <10ms per call
- Session creation: <100ms

### Environment Variables
| Variable | Purpose |
|----------|---------|
| NEXUS_OPENROUTER_API_KEY | OpenRouter API key (recommended for free models) |
| NEXUS_ANTHROPIC_API_KEY | Anthropic API key |
| NEXUS_OPENAI_API_KEY | OpenAI API key |
| NEXUS_GOOGLE_API_KEY | Google AI API key |
| NEXUS_DAILY_BUDGET | Daily cost limit (default: $5.00) |
| NEXUS_PER_TASK_BUDGET | Per-task cost limit (default: $2.00) |
| NEXUS_LOG_LEVEL | Log level: debug, info, warn, error |
| NEXUS_THEME | UI theme: system, dark, light |
| NEXUS_PLUGINS_DIR | Custom plugins directory |
| NEXUS_DISABLE_TELEMETRY | No telemetry (always true) |

### Handoff Notes for Next Developer
1. **First thing**: Run `tsx scripts/download-model.ts` to pull the 300MB micro-model
2. **Set your key**: `export NEXUS_OPENROUTER_API_KEY='sk-or-v1-...'`
3. **Verify**: `node apps/nexus-cli/dist/index.js doctor`
4. **Run tests**: `pnpm test` (389 tests, all should pass)
5. **Start coding**: `node apps/nexus-cli/dist/index.js chat`
6. **Directory structure**: All source in `packages/*/src/`, tests in `packages/*/test/`
7. **Building**: `pnpm -r exec tsc` compiles all packages
8. **Adding a package**: Create dir, add to pnpm-workspace.yaml, copy package.json pattern
9. **The `isolated-vm` issue**: If on Node 24, native build fails. The sandbox falls back — it works but is less secure. Fix by installing with `CXXFLAGS=-std=c++20` or use Node 22.
