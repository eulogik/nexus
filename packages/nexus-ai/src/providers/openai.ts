import { AbstractProvider } from '../provider.js';
import type {
  LLMRequest,
  LLMResponse,
  StreamChunk,
  CostEstimate,
  ModelDefinition,
  ToolCall,
} from '../types.js';

interface OpenAIMessage {
  role: string;
  content: string;
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
  name?: string;
}

interface OpenAIChoice {
  index: number;
  message: {
    role: string;
    content: string | null;
    tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
  };
  finish_reason: string | null;
}

interface OpenAIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: OpenAIChoice[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class OpenAIProvider extends AbstractProvider {
  constructor(config: { apiKey?: string; baseUrl?: string; enabled?: boolean; timeout?: number; retries?: number }) {
    super('openai', {
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      enabled: config.enabled ?? true,
      timeout: config.timeout ?? 60_000,
      retries: config.retries ?? 3,
    });
  }

  protected getDefaultBaseUrl(): string {
    return 'https://api.openai.com/v1';
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.config.apiKey ?? ''}`,
      'Content-Type': 'application/json',
    };
  }

  async send(request: LLMRequest): Promise<LLMResponse> {
    return this.withRetry(async () => {
      const body = this.buildOpenAIBody({ ...request, stream: false });
      const response = await this.fetchWithTimeout(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw await this.buildError(response);
      }

      const data = (await response.json()) as OpenAIResponse;

      const choice = data.choices[0]!;
      const toolCalls = choice.message.tool_calls?.map((tc) => ({
        id: tc.id,
        type: 'function' as const,
        function: { name: tc.function.name, arguments: tc.function.arguments },
      }));

      return {
        content: choice.message.content ?? '',
        toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
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

    return this.parseSSEStream(response);
  }

  private async *parseSSEStream(response: Response): AsyncIterable<StreamChunk> {
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
          if (!trimmed || trimmed.startsWith(':') || trimmed === 'data: [DONE]') {
            if (trimmed === 'data: [DONE]') {
              yield { type: 'done' };
              return;
            }
            continue;
          }

          if (trimmed.startsWith('data: ')) {
            try {
              const data = JSON.parse(trimmed.slice(6)) as {
                choices?: Array<{
                  delta: { content?: string; tool_calls?: Array<{ id?: string; index?: number; type?: string; function?: { name?: string; arguments?: string } }> };
                  finish_reason?: string | null;
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

  private buildOpenAIBody(request: LLMRequest & { stream?: boolean }): Record<string, unknown> {
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
    const inputCost = (inputTokens / 1_000_000) * model.inputCostPer1M;
    const outputCost = (outputTokens / 1_000_000) * model.outputCostPer1M;
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
