import { AbstractProvider } from '../provider.js';
import type {
  LLMRequest,
  LLMResponse,
  StreamChunk,
  CostEstimate,
  ModelDefinition,
  ToolCall,
} from '../types.js';

interface OpenRouterModel {
  id: string;
  name: string;
  context_length: number;
  pricing: { prompt: string; completion: string };
  architecture: { modality: string; tokenizer: string; instruct_type: string | null };
  top_provider: { max_completion_tokens: number | null };
  per_request_limits: { prompt_tokens: string | null; completion_tokens: string | null };
}

export class OpenRouterProvider extends AbstractProvider {
  constructor(config: { apiKey?: string; baseUrl?: string; enabled?: boolean; timeout?: number; retries?: number }) {
    super('openrouter', {
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      enabled: config.enabled ?? true,
      timeout: config.timeout ?? 60_000,
      retries: config.retries ?? 3,
    });
  }

  protected getDefaultBaseUrl(): string {
    return 'https://openrouter.ai/api/v1';
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.config.apiKey ?? ''}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://nexus-ai.dev',
      'X-Title': 'Nexus-AI',
    };
  }

  async send(request: LLMRequest): Promise<LLMResponse> {
    return this.withRetry(async () => {
      const body = this.buildOpenAIBody(request);
      const response = await this.fetchWithTimeout(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw await this.buildError(response);
      }

      const data = (await response.json()) as {
        id: string;
        choices: Array<{
          message: {
            content: string | null;
            tool_calls?: Array<{
              id: string;
              type: 'function';
              function: { name: string; arguments: string };
            }>;
          };
          finish_reason: string;
        }>;
        usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
        model: string;
      };

      const choice = data.choices[0]!;
      return {
        content: choice.message.content ?? '',
        toolCalls: choice.message.tool_calls?.map((tc) => ({
          id: tc.id,
          type: 'function' as const,
          function: { name: tc.function.name, arguments: tc.function.arguments },
        })),
        usage: {
          input: data.usage.prompt_tokens,
          output: data.usage.completion_tokens,
          total: data.usage.total_tokens,
        },
        model: data.model,
        id: data.id,
      };
    });
  }

  async stream(request: LLMRequest): Promise<AsyncIterable<StreamChunk>> {
    const body = this.buildOpenAIBody({ ...request, stream: true });

    const response = await this.withRetry(async () => {
      const res = await this.fetchWithTimeout(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(body),
      });
      if (!res.ok) throw await this.buildError(res);
      return res;
    });

    return this.parseSSEStream(response, request.model);
  }

  private async *parseSSEStream(response: Response, model: string): AsyncIterable<StreamChunk> {
    const reader = response.body?.getReader();
    if (!reader) {
      yield { type: 'done', error: 'No response body' };
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(':')) continue;
          if (trimmed === 'data: [DONE]') {
            yield { type: 'done' };
            return;
          }
          if (trimmed.startsWith('data: ')) {
            try {
              const data = JSON.parse(trimmed.slice(6)) as {
                choices?: Array<{
                  delta: { content?: string; tool_calls?: Array<{ id?: string; type: string; function?: { name?: string; arguments?: string } }> };
                  finish_reason?: string;
                }>;
                usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
              };

              if (data.usage) {
                yield {
                  type: 'done',
                  usage: {
                    input: data.usage.prompt_tokens,
                    output: data.usage.completion_tokens,
                    total: data.usage.total_tokens,
                  },
                };
                continue;
              }

              const choice = data.choices?.[0];
              if (!choice) continue;

              if (choice.finish_reason === 'stop' || choice.finish_reason === 'end_turn') {
                yield { type: 'done' };
                continue;
              }

              if (choice.delta?.content) {
                yield { type: 'text', content: choice.delta.content };
              }

              if (choice.delta?.tool_calls) {
                for (const tc of choice.delta.tool_calls) {
                  yield {
                    type: 'tool_call',
                    toolCall: {
                      id: tc.id ?? '',
                      type: 'function',
                      function: {
                        name: tc.function?.name ?? '',
                        arguments: tc.function?.arguments ?? '',
                      },
                    },
                  };
                }
              }
            } catch {
              // Skip malformed JSON lines
            }
          }
        }
      }
      yield { type: 'done' };
    } catch (error) {
      yield { type: 'done', error: (error as Error).message };
    } finally {
      reader.releaseLock();
    }
  }

  async getModels(): Promise<ModelDefinition[]> {
    try {
      const response = await this.fetchWithTimeout(`${this.baseUrl}/models`, {
        method: 'GET',
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) return this.getDefaultModels();

      const data = (await response.json()) as { data: OpenRouterModel[] };
      return data.data.map((m) => this.mapModel(m));
    } catch {
      return this.getDefaultModels();
    }
  }

  private mapModel(orm: OpenRouterModel): ModelDefinition {
    const inputPrice = parseFloat(orm.pricing.prompt) || 0;
    const outputPrice = parseFloat(orm.pricing.completion) || 0;
    const isFree = inputPrice === 0 && outputPrice === 0;
    const id = orm.id;
    const lowerId = id.toLowerCase();

    let tier: ModelDefinition['tier'] = 'standard';
    if (isFree) tier = 'free';
    else if (inputPrice < 0.5) tier = 'cheap';
    else if (inputPrice > 5) tier = 'premium';

    return {
      id,
      name: orm.name ?? id,
      provider: 'openrouter',
      protocol: 'openai',
      contextWindow: orm.context_length ?? 8192,
      maxOutputTokens: orm.top_provider?.max_completion_tokens ?? 4096,
      supportsVision: orm.architecture?.modality?.includes('text') || false,
      supportsToolUse: true,
      supportsStreaming: true,
      supportsReasoning: lowerId.includes('reasoning') || lowerId.includes('deepseek-r1'),
      inputCostPer1M: inputPrice,
      outputCostPer1M: outputPrice,
      tier,
      isFree,
      isLocal: false,
      typicalLatency: isFree ? 5000 : 2000,
      qualityScore: lowerId.includes('sonnet') || lowerId.includes('gpt-4') ? 9 : lowerId.includes('haiku') || lowerId.includes('flash') ? 7 : 6,
    };
  }

  private getDefaultModels(): ModelDefinition[] {
    return [
      {
        id: 'qwen/qwen3-235b-a22b:free',
        name: 'Qwen3 235B-A22B (Free)',
        provider: 'openrouter',
        protocol: 'openai',
        contextWindow: 32768,
        maxOutputTokens: 4096,
        supportsVision: false,
        supportsToolUse: true,
        supportsStreaming: true,
        supportsReasoning: false,
        inputCostPer1M: 0,
        outputCostPer1M: 0,
        tier: 'free',
        isFree: true,
        isLocal: false,
        typicalLatency: 3000,
        qualityScore: 7,
      },
      {
        id: 'meta-llama/llama-3.3-70b-instruct:free',
        name: 'Llama 3.3 70B (Free)',
        provider: 'openrouter',
        protocol: 'openai',
        contextWindow: 32768,
        maxOutputTokens: 4096,
        supportsVision: false,
        supportsToolUse: true,
        supportsStreaming: true,
        supportsReasoning: false,
        inputCostPer1M: 0,
        outputCostPer1M: 0,
        tier: 'free',
        isFree: true,
        isLocal: false,
        typicalLatency: 3000,
        qualityScore: 7,
      },
      {
        id: 'google/gemini-2.0-flash-001',
        name: 'Gemini 2.0 Flash',
        provider: 'openrouter',
        protocol: 'openai',
        contextWindow: 1048576,
        maxOutputTokens: 8192,
        supportsVision: true,
        supportsToolUse: true,
        supportsStreaming: true,
        supportsReasoning: false,
        inputCostPer1M: 0.1,
        outputCostPer1M: 0.4,
        tier: 'cheap',
        isFree: false,
        isLocal: false,
        typicalLatency: 1500,
        qualityScore: 8,
      },
      {
        id: 'anthropic/claude-3.5-sonnet',
        name: 'Claude 3.5 Sonnet',
        provider: 'openrouter',
        protocol: 'openai',
        contextWindow: 200000,
        maxOutputTokens: 8192,
        supportsVision: true,
        supportsToolUse: true,
        supportsStreaming: true,
        supportsReasoning: false,
        inputCostPer1M: 3.0,
        outputCostPer1M: 15.0,
        tier: 'standard',
        isFree: false,
        isLocal: false,
        typicalLatency: 2000,
        qualityScore: 9,
      },
    ];
  }

  private buildOpenAIBody(request: LLMRequest): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: request.model,
      messages: request.messages.map((msg) => {
        const m: Record<string, unknown> = { role: msg.role, content: msg.content };
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          m.tool_calls = msg.toolCalls.map((tc) => ({
            id: tc.id,
            type: tc.type,
            function: { name: tc.function.name, arguments: tc.function.arguments },
          }));
        }
        if (msg.toolCallId) m.tool_call_id = msg.toolCallId;
        if (msg.name) m.name = msg.name;
        return m;
      }),
      stream: request.stream ?? false,
    };

    if (request.tools && request.tools.length > 0) {
      body.tools = request.tools.map((t) => ({
        type: t.type,
        function: {
          name: t.function.name,
          description: t.function.description,
          parameters: t.function.parameters,
        },
      }));
    }

    if (request.temperature !== undefined) body.temperature = request.temperature;
    if (request.maxTokens !== undefined) body.max_tokens = request.maxTokens;

    return body;
  }

  estimateCost(inputTokens: number, outputTokens: number, model: ModelDefinition): CostEstimate {
    const inputCost = model.isFree ? 0 : (inputTokens / 1_000_000) * model.inputCostPer1M;
    const outputCost = model.isFree ? 0 : (outputTokens / 1_000_000) * model.outputCostPer1M;
    return {
      inputTokens,
      outputTokens,
      inputCost,
      outputCost,
      totalCost: inputCost + outputCost,
      model: model.id,
    };
  }
}
