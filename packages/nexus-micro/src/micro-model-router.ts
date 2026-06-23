import type { Router, RoutingDecision, Session, MicroModelConfig } from './types.js';
import { RuleBasedRouter } from './rule-based-router.js';
import { MicroModelEngine } from './engine.js';
import { validateRoutingDecision } from './validator.js';

const DEFAULT_MODEL = 'qwen3.5-0.5b-instruct-q4_k_m.gguf';
const DEFAULT_DOWNLOAD_URL = 'https://huggingface.co/Qwen/Qwen3.5-0.5B-Instruct-GGUF/resolve/main/qwen3.5-0.5b-instruct-q4_k_m.gguf';
const MODEL_DIR = `${process.env.HOME || '/tmp'}/.nexus/models`;

export class MicroModelRouter implements Router {
  private engine: MicroModelEngine;
  private fallbackRouter: RuleBasedRouter;
  private initialized = false;

  constructor() {
    this.engine = new MicroModelEngine();
    this.fallbackRouter = new RuleBasedRouter();
  }

  async initialize(config?: Partial<MicroModelConfig>): Promise<void> {
    try {
      const resolvedConfig: MicroModelConfig = {
        provider: config?.provider ?? 'local',
        model: config?.model ?? DEFAULT_MODEL,
        quantization: config?.quantization ?? 'q4_k_m',
        contextSize: config?.contextSize ?? 4096,
        gpuLayers: config?.gpuLayers ?? 0,
        threads: config?.threads ?? 4,
        downloadUrl: config?.downloadUrl ?? `${MODEL_DIR}/${DEFAULT_MODEL}`,
      };

      if (!resolvedConfig.downloadUrl || resolvedConfig.downloadUrl === `${MODEL_DIR}/${DEFAULT_MODEL}`) {
        resolvedConfig.downloadUrl = DEFAULT_DOWNLOAD_URL;
      }

      await this.engine.initialize(resolvedConfig);
      this.initialized = this.engine.isInitialized;
    } catch (err) {
      console.error(`[nexus-micro] MicroModelRouter initialization failed:`, (err as Error).message);
      console.warn(`[nexus-micro] Falling back to rule-based routing`);
      this.initialized = false;
    }
  }

  async route(userRequest: string, session: Session): Promise<RoutingDecision> {
    if (!this.initialized) {
      return this.fallbackRouter.route(userRequest, session);
    }

    try {
      const conversationContext = session.messages
        .slice(-6)
        .map((m) => `${m.role}: ${m.content}`)
        .join('\n');

      const prompt = `Conversation history:\n${conversationContext}\n\nUser request: ${userRequest}\n\nRespond with JSON only.`;

      const response = await this.engine.prompt(prompt, {
        temperature: 0.1,
        maxTokens: 256,
      });

      const cleaned = this.cleanResponse(response);
      const parsed = JSON.parse(cleaned) as RoutingDecision;

      const validation = validateRoutingDecision(parsed);

      if (!validation.valid) {
        console.warn(`[nexus-micro] Model returned invalid decision: ${validation.errors.join('; ')}`);
        return this.fallbackRouter.route(userRequest, session);
      }

      return {
        ...parsed,
        confidence: Math.min(parsed.confidence, 0.85),
        suggestedTools: parsed.suggestedTools ?? [],
        suggestedModels: parsed.suggestedModels ?? [],
      };
    } catch (err) {
      console.warn(`[nexus-micro] Model routing failed:`, (err as Error).message);
      return this.fallbackRouter.route(userRequest, session);
    }
  }

  private cleanResponse(response: string): string {
    let cleaned = response.trim();

    const jsonMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      cleaned = jsonMatch[1]!.trim();
    }

    const braceStart = cleaned.indexOf('{');
    const braceEnd = cleaned.lastIndexOf('}');

    if (braceStart !== -1 && braceEnd !== -1 && braceEnd > braceStart) {
      cleaned = cleaned.slice(braceStart, braceEnd + 1);
    }

    return cleaned;
  }

  dispose(): void {
    this.engine.dispose();
    this.initialized = false;
  }
}
