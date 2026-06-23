# Nexus Architecture

## Overview
Nexus is a modular monorepo with 6 packages and 2 apps.

## Package Dependencies
```
nexus-cli → nexus-core → nexus-ai
                      → nexus-micro
                      → nexus-compress
                      → nexus-plugin-sdk
         → nexus-tui

nexus-sdk → nexus-core → nexus-ai
                      → nexus-micro
                      → nexus-compress
                      → nexus-plugin-sdk
```

## Core Data Flow
1. User input → CLI/TUI/SDK
2. → Agent Loop (nexus-core)
3. → Micro-Model Router (nexus-micro) — intent classification + routing
4. → Provider Registry (nexus-ai) — model selection + API call
5. → Content Router (nexus-compress) — compression + cache alignment
6. → LLM Response → Tool Execution → Loop
7. → Git Commit → Session Save

## Security Model
- API keys stored encrypted (AES-256-GCM) or via OS keychain (keytar)
- Plugin sandbox: isolated-vm with 128MB heap, 5s timeout, no require()
- All dangerous commands blocked by safety checks
- Network access limited to allowlist
- Path validation prevents directory traversal

## Compression Pipeline
Content → ContentRouter → Strategy Selection → Compress → LLM
                                           →
                                      CacheAligner → KV Cache Hit

## Directory Structure
```
nexus/
├── apps/
│   ├── nexus-cli/          # Command-line interface (yargs-based)
│   └── nexus-sdk/          # Public SDK for programmatic usage
├── packages/
│   ├── nexus-core/         # Agent loop, tools, session management
│   ├── nexus-ai/           # LLM provider abstraction + OpenRouter
│   ├── nexus-micro/        # Local micro-model inference
│   ├── nexus-compress/     # Prompt compression pipeline
│   ├── nexus-plugin-sdk/   # Plugin system + isolated-vm sandbox
│   └── nexus-tui/          # Terminal UI (Ink + React)
├── plugins/                # Official plugins (git, mcp, github, docker, test)
├── scripts/                # Build, test, benchmark, release scripts
└── docs/                   # Documentation
```
