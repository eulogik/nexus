# Plugin Development Guide

## Overview

Nexus plugins are isolated JavaScript modules that extend Nexus with custom tools, event handlers, and integrations. Plugins run in an `isolated-vm` sandbox with strict resource limits.

## Creating a Plugin

### 1. Create the plugin directory

```
plugins/my-plugin/
├── manifest.json
├── index.js
└── README.md
```

### 2. Plugin Manifest Format

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "description": "Does something useful",
  "entry": "index.js",
  "permissions": ["fs.read"],
  "config": {
    "apiUrl": {
      "type": "string",
      "default": "https://api.example.com",
      "description": "API endpoint URL"
    },
    "timeout": {
      "type": "number",
      "default": 5000,
      "description": "Request timeout in ms"
    }
  }
}
```

### Available Permissions

| Permission | Scope | Description |
|------------|-------|-------------|
| `fs.read` | filesystem | Read files from allowed paths |
| `fs.write` | filesystem | Write files to allowed paths |
| `net.connect` | network | Make HTTP/HTTPS requests |
| `process.spawn` | system | Execute child processes |
| `env.read` | environment | Read environment variables |

### 3. Plugin Entry Point

```javascript
// index.js
const plugin = {
  name: "my-plugin",
  version: "1.0.0",

  async init(ctx) {
    // Called when plugin is loaded
    ctx.logger.info("Plugin initialized")

    // Register a tool
    ctx.tools.register({
      name: "hello",
      description: "Says hello to someone",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Name to greet",
          },
        },
        required: ["name"],
      },
      async execute(args) {
        return {
          success: true,
          data: `Hello, ${args.name}!`,
        }
      },
    })

    // Listen for events
    ctx.events.on("session:start", (payload) => {
      ctx.logger.info(`Session started: ${payload.sessionId}`)
    })
  },

  async destroy(ctx) {
    // Cleanup when plugin is unloaded
    ctx.logger.info("Plugin destroyed")
  },
}

export default plugin
```

## Plugin API Reference

### `ctx.logger`

```typescript
interface Logger {
  debug(msg: string, ...args: unknown[]): void
  info(msg: string, ...args: unknown[]): void
  warn(msg: string, ...args: unknown[]): void
  error(msg: string, ...args: unknown[]): void
}
```

### `ctx.storage`

Persistent key-value store scoped to the plugin.

```typescript
interface PluginStorage {
  get(key: string): Promise<string | undefined>
  set(key: string, value: string): Promise<void>
  delete(key: string): Promise<void>
  list(): Promise<string[]>
}
```

### `ctx.tools`

```typescript
interface ToolAPI {
  register(tool: ToolDefinition): void
  unregister(name: string): void
  list(): ToolDefinition[]
}
```

### `ctx.events`

Built-in events emitted by Nexus:

| Event | Payload | Description |
|-------|---------|-------------|
| `session:start` | `{ sessionId }` | Session started |
| `session:end` | `{ sessionId, turns }` | Session ended |
| `message:before` | `{ content }` | Before LLM call |
| `message:after` | `{ content, response }` | After LLM response |
| `tool:before` | `{ name, args }` | Before tool execution |
| `tool:after` | `{ name, result }` | After tool execution |
| `error` | `{ message, stack }` | Unhandled error |

## Testing Plugins

Create a `test` directory in your plugin:

```
plugins/my-plugin/
├── manifest.json
├── index.js
├── test/
│   └── index.test.js
```

Example test:

```javascript
import { describe, it, expect } from "vitest"
import plugin from "../index.js"

describe("my-plugin", () => {
  it("registers hello tool", async () => {
    const tools = { register: vi.fn(), unregister: vi.fn(), list: vi.fn() }
    const ctx = {
      logger: console,
      storage: { get: vi.fn(), set: vi.fn(), delete: vi.fn(), list: vi.fn() },
      tools,
      events: { on: vi.fn(), off: vi.fn(), emit: vi.fn() },
    }

    await plugin.init(ctx)
    expect(tools.register).toHaveBeenCalledWith(
      expect.objectContaining({ name: "hello" })
    )
  })
})
```

## Publishing Plugins

1. Ensure `manifest.json` is valid
2. Publish to npm as a public package
3. Package name convention: `nexus-plugin-<name>`
4. Users can install via: `nexus plugin install nexus-plugin-my-plugin`

### Plugin Directory Structure for npm

```
nexus-plugin-my-plugin/
├── package.json      # "main" points to index.js, "nexus-plugin" field for manifest
├── manifest.json     # Plugin manifest
├── index.js          # Plugin implementation
├── test/
│   └── index.test.js
└── README.md
```

The `package.json` should include a `nexus-plugin` field pointing to the manifest:

```json
{
  "name": "nexus-plugin-my-plugin",
  "version": "1.0.0",
  "nexus-plugin": "./manifest.json",
  "main": "./index.js"
}
```
