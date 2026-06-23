import { type PluginManifest, type JSONSchema } from "./types.js";

const VALID_PERMISSIONS = [
  "fs:read",
  "fs:write",
  "fs:delete",
  "process:spawn",
  "network:fetch",
  "network:listen",
  "git:read",
  "git:write",
  "env:read",
  "env:write",
  "tools:run",
  "ui:notify",
];

export class ManifestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManifestValidationError";
  }
}

export function validateManifest(manifest: unknown): PluginManifest {
  if (typeof manifest !== "object" || manifest === null) {
    throw new ManifestValidationError("Manifest must be a non-null object");
  }

  const m = manifest as Record<string, unknown>;

  if (typeof m.name !== "string" || m.name.length === 0) {
    throw new ManifestValidationError("Manifest must have a non-empty string 'name'");
  }

  if (typeof m.version !== "string" || m.version.length === 0) {
    throw new ManifestValidationError("Manifest must have a non-empty string 'version'");
  }

  if (typeof m.main !== "string" || m.main.length === 0) {
    throw new ManifestValidationError("Manifest must have a non-empty string 'main'");
  }

  if (!Array.isArray(m.permissions)) {
    throw new ManifestValidationError("Manifest must have an array 'permissions'");
  }

  for (const perm of m.permissions) {
    if (typeof perm !== "string") {
      throw new ManifestValidationError(`Permission must be a string, got ${typeof perm}`);
    }
    if (!VALID_PERMISSIONS.includes(perm)) {
      throw new ManifestValidationError(`Invalid permission: "${perm}". Valid permissions: ${VALID_PERMISSIONS.join(", ")}`);
    }
  }

  if (m.tools !== undefined) {
    if (!Array.isArray(m.tools)) {
      throw new ManifestValidationError("'tools' must be an array");
    }
    for (const tool of m.tools) {
      if (typeof tool.name !== "string") {
        throw new ManifestValidationError("Each tool must have a string 'name'");
      }
      if (typeof tool.description !== "string") {
        throw new ManifestValidationError("Each tool must have a string 'description'");
      }
      if (typeof tool.parameters !== "object" || tool.parameters === null) {
        throw new ManifestValidationError("Each tool must have a 'parameters' object");
      }
    }
  }

  if (m.hooks !== undefined) {
    if (!Array.isArray(m.hooks)) {
      throw new ManifestValidationError("'hooks' must be an array");
    }
    for (const hook of m.hooks) {
      if (typeof hook.event !== "string") {
        throw new ManifestValidationError("Each hook must have a string 'event'");
      }
      if (typeof hook.handler !== "string") {
        throw new ManifestValidationError("Each hook must have a string 'handler'");
      }
    }
  }

  return m as unknown as PluginManifest;
}

export async function loadManifest(path: string): Promise<PluginManifest> {
  const fs = await import("node:fs");
  const content = fs.readFileSync(path, "utf-8");
  const parsed = JSON.parse(content);

  if (parsed.nexus && typeof parsed.nexus === "object") {
    const manifest: PluginManifest = {
      name: parsed.name,
      version: parsed.version,
      description: parsed.description,
      author: parsed.author,
      main: parsed.main ?? parsed.nexus.main,
      permissions: parsed.nexus.permissions ?? [],
      tools: parsed.nexus.tools,
      hooks: parsed.nexus.hooks,
      commands: parsed.nexus.commands,
      ui: parsed.nexus.ui,
    };
    return validateManifest(manifest);
  }

  return validateManifest(parsed);
}

export function getDefaultManifest(name: string): PluginManifest {
  return {
    name,
    version: "1.0.0",
    description: "",
    author: "",
    main: "index.js",
    permissions: [],
    tools: [
      {
        name: "hello",
        description: "A sample tool",
        parameters: {
          type: "object",
          properties: {
            name: { type: "string", description: "Your name" },
          },
          required: ["name"],
        },
      },
    ],
  };
}
