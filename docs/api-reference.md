# API Reference

## Nexus SDK (`nexus-sdk`)

The `Nexus` class is the main entry point for programmatic usage.

### `new Nexus(options?: NexusOptions)`

Creates a new Nexus instance.

```typescript
interface NexusOptions {
  config?: Partial<NexusConfig>
  session?: SessionOptions
}
```

### Instance Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `chat` | `(input: string, opts?: ChatOptions) => AsyncIterable<Chunk>` | Send a message and stream the response |
| `execute` | `(input: string) => Promise<ExecutionResult>` | Execute a single command and return the result |
| `session` | `() => SessionManager` | Access the current session manager |
| `config` | `() => NexusConfig` | Get the current configuration |
| `updateConfig` | `(updates: Partial<NexusConfig>) => void` | Update configuration at runtime |
| `plugin` | `(name: string) => PluginAPI \| undefined` | Access a loaded plugin by name |
| `destroy` | `() => Promise<void>` | Clean up resources and dispose of the instance |

### ChatOptions

```typescript
interface ChatOptions {
  sessionId?: string
  stream?: boolean
  tools?: string[]
  model?: string
  temperature?: number
  maxTokens?: number
}
```

### ExecutionResult

```typescript
interface ExecutionResult {
  success: boolean
  output: string
  toolCalls: ToolCall[]
  duration: number
  tokensUsed: number
  cost: number
}
```

---

## CLI Commands (`nexus-cli`)

### Global Flags

| Flag | Alias | Description |
|------|-------|-------------|
| `--config` | `-c` | Path to config file |
| `--verbose` | `-v` | Enable verbose logging |
| `--no-color` | | Disable colored output |
| `--help` | `-h` | Show help |
| `--version` | | Show version |

### `nexus init [directory]`

Initialize a new Nexus project.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--template` | `string` | `"default"` | Project template to use |
| `--force` | `boolean` | `false` | Overwrite existing files |
| `--git` | `boolean` | `true` | Initialize git repository |

### `nexus chat [message]`

Start an interactive chat session or send a single message.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--session` | `string` | auto | Session ID or name |
| `--model` | `string` | config | Model to use |
| `--no-stream` | `boolean` | `false` | Disable streaming output |
| `--tools` | `string[]` | all | Tools to enable |

### `nexus config [key] [value]`

Get or set configuration values.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--global` | `boolean` | `false` | Use global config instead of local |
| `--json` | `boolean` | `false` | Output as JSON |

### `nexus doctor`

Run system diagnostics.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--fix` | `boolean` | `false` | Auto-fix detected issues |

---

## Plugin API (`nexus-plugin-sdk`)

### PluginContext

Properties available to every plugin:

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | Plugin name |
| `version` | `string` | Plugin version |
| `config` | `Record<string, unknown>` | Plugin configuration |
| `logger` | `Logger` | Scoped logger instance |
| `storage` | `PluginStorage` | Persistent key-value storage |
| `events` | `EventEmitter` | Event bus for cross-plugin communication |
| `tools` | `ToolAPI` | Tool registration and execution |

### PluginStorage

```typescript
interface PluginStorage {
  get(key: string): Promise<string | undefined>
  set(key: string, value: string): Promise<void>
  delete(key: string): Promise<void>
  list(): Promise<string[]>
}
```

### ToolAPI

```typescript
interface ToolAPI {
  register(tool: ToolDefinition): void
  unregister(name: string): void
  list(): ToolDefinition[]
}

interface ToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>
  execute(args: Record<string, unknown>): Promise<ToolResult>
}

interface ToolResult {
  success: boolean
  data?: unknown
  error?: string
}
```

### EventEmitter

```typescript
interface EventEmitter {
  on(event: string, handler: (payload: unknown) => void): void
  off(event: string, handler: (payload: unknown) => void): void
  emit(event: string, payload: unknown): void
}
```

### Permissions

| Permission | Description |
|------------|-------------|
| `fs.read` | Read files from disk |
| `fs.write` | Write files to disk |
| `net.connect` | Make network connections |
| `process.spawn` | Spawn child processes |
| `env.read` | Read environment variables |

---

## Configuration Schema

All config keys with their types and descriptions.

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `provider` | `string` | `"openrouter"` | LLM provider to use |
| `model` | `string` | `"auto"` | Model identifier or "auto" |
| `apiKey` | `string` | — | API key for the provider |
| `temperature` | `number` | `0.7` | LLM temperature (0-2) |
| `maxTokens` | `number` | `4096` | Maximum tokens per response |
| `timeout` | `number` | `60000` | Request timeout in ms |
| `budget.monthly` | `number` | `0` | Monthly spend cap (0 = unlimited) |
| `budget.warning` | `number` | `0` | Warning threshold (0 = disabled) |
| `compression.enabled` | `boolean` | `true` | Enable prompt compression |
| `compression.strategy` | `string` | `"auto"` | Compression strategy |
| `compression.minRatio` | `number` | `0.5` | Minimum compression ratio |
| `session.autoCommit` | `boolean` | `true` | Auto-commit after each turn |
| `session.branchPerSession` | `boolean` | `true` | Create git branch per session |
| `plugins.enabled` | `string[]` | `[]` | List of enabled plugins |
| `plugins.timeout` | `number` | `5000` | Plugin execution timeout |
| `plugins.maxHeap` | `number` | `128` | Plugin sandbox heap (MB) |
| `safety.dangerousCommands` | `string[]` | `[]` | Blocked command patterns |
| `safety.networkAllowlist` | `string[]` | `[]` | Allowed network targets |
| `safety.pathAllowlist` | `string[]` | `[]` | Allowed file paths |

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `OPENROUTER_API_KEY` | OpenRouter API key |
| `OPENAI_API_KEY` | OpenAI API key |
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `GOOGLE_API_KEY` | Google AI API key |
| `NEXUS_CONFIG_PATH` | Path to config file |
| `NEXUS_DATA_DIR` | Data directory (default: `.nexus`) |
| `NEXUS_LOG_LEVEL` | Log level: `debug`, `info`, `warn`, `error` |
| `NEXUS_NO_COLOR` | Disable colors (set to `1`) |
| `NEXUS_PLUGIN_DIR` | Plugin directory |
| `NEXUS_DISABLE_TELEMETRY` | Disable telemetry (set to `1`) |
