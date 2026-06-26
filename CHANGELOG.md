# Changelog

All notable changes to the Nexus project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-06-25

### 🚀 Major Features

- **Full Agent Loop Integration** — Bridge script now supports multi-turn tool execution (50 iterations). The agent can read files, write code, run commands, and fix issues in a single request.
- **Git Stage/Unstage/Discard** — New commands: `stage_file`, `unstage_file`, `discard_changes`, `list_unstaged_files`. Manage git changes directly from Nexus.
- **Project Context Loading** — Bridge now reads `AGENTS.md`, `.cursorrules`, `CLAUDE.md`, and `.nexus.md` from project root and injects them into the system prompt.
- **Onboarding Splash Page** — Beautiful first-time experience with quick actions ("Add Local Directory", "Clone Repository").
- **Sidebar Footer** — Always-visible footer with `+ Project` button and connection status indicator.
- **Always-Visible Settings** — Settings gear button now always visible in top bar, not just when API key is missing.

### 🐛 Bug Fixes

- **Fixed bridge error** — Embedded bridge script as Rust string constant, eliminating file path resolution issues caused by `std::env::current_dir()` returning wrong directory in DMG/readonly contexts.
- **Fixed disappearing chat responses** — `streamingContent` now stays visible until `get_session_messages` resolves, preventing empty bubble flicker.
- **Fixed double responses** — Rust no longer creates duplicate assistant messages; bridge saves complete conversation once.
- **Fixed session disappearing** — Removed `syncSessions()` from `stream-done` handler; added `activeSessionRef` to avoid stale closures.
- **Fixed save_settings argument mismatch** — Now reads existing config and merges with new values.

### 🔧 Improvements

- **Cost tracking** — Token usage and estimated cost displayed in status bar.
- **Tool call badges** — Each tool execution shows a colored badge with tool name and arguments.
- **Message timestamps** — Each message shows when it was sent.
- **Markdown rendering** — Full support for tables, code blocks, lists, and GFM features.
- **Diff viewer** — Color-coded git diff with line highlighting.
- **Message bubble design** — User messages in blue, assistant messages with gradient avatar.
- **Keyboard shortcuts** — `⌘K` command palette, `⌘B` sidebar, `⌘W` close, `Esc` dismiss.

### 🏗️ Architecture

- **Embedded bridge script** — Bridge is now a Rust `const` string with `r#"..."#` raw syntax, no external file dependency.
- **Full message serialization** — All messages (user, assistant, tool, tool_calls, tool_call_id) saved to disk in unified schema.
- **Token accounting** — Bridge tracks input/output tokens and streams them to frontend.

### 📦 Release Artifacts

- **Desktop**: macOS (aarch64/x64), Windows (x64), Linux (.deb/.AppImage)
- **npm packages**: `nexus-ai`, `nexus-core`, `nexus-sdk`
- **Docker**: `ghcr.io/eulogik/nexus:latest`

---

## [1.0.0] - 2026-06-20

### Initial Release

- **Desktop app** — Tauri v2 based desktop application with streaming chat, file tree, session sidebar
- **Agent runtime** — 7 tools (read, write, edit, bash, glob, grep), 50-iteration loop
- **Multi-provider LLM** — OpenRouter (300+ models), Anthropic, OpenAI, Google
- **Plugin system** — 5 official plugins (Git, GitHub, Docker, MCP, Test)
- **Prompt compression** — 30-60% context savings
- **Micro-model routing** — 0.5B local model for intent classification
- **CLI** — 6 commands (init, chat, config, doctor, sessions, fork)
- **TUI** — Terminal UI with Ink + React
- **571 tests** — Across 40 test files
