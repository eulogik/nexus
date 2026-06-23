import type { MicroModelConfig } from './types.js';
import { getLlama, type LlamaChatSession, type LlamaModel } from 'node-llama-cpp';

export const ROUTER_SYSTEM_PROMPT = `You are a routing decision engine for Nexus, an AI coding agent harness.
Your ONLY job is to analyze a user request and conversation history, then output a JSON object matching this exact schema:

{
  "intent": "read" | "write" | "edit" | "bash" | "search" | "explain" | "debug" | "refactor" | "test" | "deploy" | "unknown",
  "complexity": <number between 0 and 1>,
  "model": "free" | "cheap" | "standard" | "premium",
  "compression": "smart-crusher" | "code-compressor" | "prose-compressor",
  "approval": "auto" | "notify" | "ask",
  "reason": "<brief explanation of the routing decision>",
  "estimatedTokens": <estimated token count, positive integer>,
  "estimatedCost": <estimated cost as number>,
  "suggestedTools": ["<tool names that would help>"],
  "suggestedModels": ["<model names that would suit this task>"],
  "fallbackStrategy": "direct" | "cascade" | "parallel" | "ask_user",
  "confidence": <number between 0 and 1>
}

Rules:
- "read" for file reading, listing, searching code
- "write" for creating new files
- "edit" for modifying existing files
- "bash" for running shell commands
- "search" for searching across the codebase
- "explain" for code explanation requests
- "debug" for debugging issues
- "refactor" for code refactoring
- "test" for writing or running tests
- "deploy" for deployment operations
- Complexity: 0.1 for simple reads, 0.3 for single-file edits, 0.6 for multi-step, 0.9 for complex refactors
- Model tier: "free" for low complexity, "cheap" for moderate, "standard" for complex, "premium" for very complex
- Compression: "smart-crusher" for data/json/api, "code-compressor" for code, "prose-compressor" for text
- Approval: "auto" for safe reads, "notify" for writes/edits, "ask" for destructive operations
- Fallback: "direct" for simple, "cascade" for complex multi-step, "parallel" for independent sub-tasks

Output ONLY valid JSON. No markdown, no explanation, no code fences.`;

const MODEL_DIR = `${process.env.HOME || '/tmp'}/.nexus/models`;

export class MicroModelEngine {
  private model: LlamaModel | null = null;
  private session: LlamaChatSession | null = null;
  private initialized = false;

  get isInitialized(): boolean {
    return this.initialized;
  }

  async initialize(config: MicroModelConfig): Promise<void> {
    try {
      const fs = await import('node:fs');
      if (!fs.existsSync(MODEL_DIR)) {
        fs.mkdirSync(MODEL_DIR, { recursive: true });
      }

      const modelPath = `${MODEL_DIR}/${config.model}`;

      if (!fs.existsSync(modelPath) && config.downloadUrl) {
        await this.downloadModel(config.downloadUrl, modelPath);
      }

      if (!fs.existsSync(modelPath)) {
        throw new Error(`Model file not found: ${modelPath}`);
      }

      const llama = await getLlama();
      this.model = await llama.loadModel({
        modelPath,
        gpuLayers: config.gpuLayers,
      });

      const context = await this.model.createContext({
        contextSize: config.contextSize,
      });

      this.session = new (await import('node-llama-cpp')).LlamaChatSession({
        contextSequence: context.getSequence(),
        systemPrompt: ROUTER_SYSTEM_PROMPT,
      });

      this.initialized = true;
    } catch (err) {
      console.error(`[nexus-micro] Engine initialization failed:`, (err as Error).message);
      this.initialized = false;
    }
  }

  async prompt(
    text: string,
    _options?: { temperature?: number; maxTokens?: number }
  ): Promise<string> {
    if (!this.session || !this.initialized) {
      throw new Error('Engine not initialized');
    }

    const response = await this.session.prompt(text, {
      temperature: _options?.temperature ?? 0.1,
      maxTokens: _options?.maxTokens ?? 256,
    });

    return response;
  }

  async downloadModel(url: string, dest: string): Promise<void> {
    const fs = await import('node:fs');
    const https = await import('node:https');

    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(dest);
      let downloadedBytes = 0;
      let lastReportedMB = 0;

      https.get(url, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`Download failed with status ${response.statusCode}`));
          return;
        }

        const total = parseInt(response.headers['content-length'] ?? '0', 10);

        response.on('data', (chunk: Buffer) => {
          downloadedBytes += chunk.length;
          const currentMB = Math.floor(downloadedBytes / (1024 * 1024));
          if (currentMB > lastReportedMB) {
            lastReportedMB = currentMB;
            const percent = total ? Math.round((downloadedBytes / total) * 100) : 0;
            console.log(`[nexus-micro] Downloading model: ${currentMB}MB / ${total ? Math.round(total / (1024 * 1024)) + 'MB' : '...'} (${percent}%)`);
          }
        });

        response.pipe(file);

        file.on('finish', () => {
          file.close();
          console.log(`[nexus-micro] Model downloaded to ${dest}`);
          resolve();
        });
      }).on('error', (err) => {
        fs.unlink(dest, () => {});
        reject(err);
      });
    });
  }

  dispose(): void {
    this.model?.dispose();
    this.model = null;
    this.session = null;
    this.initialized = false;
  }
}
