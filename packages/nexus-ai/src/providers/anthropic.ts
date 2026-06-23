import { AbstractProvider } from '../provider.js';
import type {
  LLMRequest,
  LLMResponse,
  StreamChunk,
  CostEstimate,
  ModelDefinition,
  ToolCall,
} from '../types.js';

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: Array<{ type: 'text' | 'tool_use' | 'tool_result'; text?: string; id?: string; name?: string; input?: Record<string, unknown>; content?: string; tool_use_id?: string }>;
}

interface AnthropicRequest {
  model: string;
  max_tokens: number;
  messages: AnthropicMessage[];
  system?: string;
  tools?: Array<{
    name: string;
    description: string;
    input_schema: Record<string, unknown>;
  }>;
  temperature?: number;
  stream?: boolean;
}

interface AnthropicResponse {
  id: string;
  type: string;
  role: string;
  content: Array<{ type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }>;
  stop_reason: string | null;
  usage: { input_tokens: number; output_tokens: number };
  model: string;
}

export class AnthropicProvider extends AbstractProvider {
  constructor(config: { apiKey?: string; baseUrl?: string; enabled?: boolean; timeout?: number; retries?: number }) {
    super('anthropic', {
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      enabled: config.enabled ?? true,
      timeout: config.timeout ?? 60_000,
      retries: config.retries ?? 3,
    });
  }

  protected getDefaultBaseUrl(): string {
    return 'https://api.anthropic.com/v1';
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      'x-api-key': this.config.apiKey ?? '',
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    };
  }

  async send(request: LLMRequest): Promise<LLMResponse> {
    return this.withRetry(async () => {
      const body = this.buildAnthropicBody({ ...request, stream: false });
      const response = await this.fetchWithTimeout(`${this.baseUrl}/messages`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw await this.buildError(response);
      }

      const data = (await response.json()) as AnthropicResponse;

      const textParts: string[] = [];
      const toolCalls: ToolCall[] = [];

      for (const block of data.content) {
        if (block.type === 'text' && block.text) {
          textParts.push(block.text);
        } else if (block.type === 'tool_use' && block.id && block.name) {
          toolCalls.push({
            id: block.id,
            type: 'function',
            function: {
              name: block.name,
              arguments: JSON.stringify(block.input ?? {}),
            },
          });
        }
      }

      return {
        content: textParts.join(''),
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        usage: {
          input: data.usage.input_tokens,
          output: data.usage.output_tokens,
          total: data.usage.input_tokens + data.usage.output_tokens,
        },
        model: data.model,
        id: data.id,
      };
    });
  }

  async stream(request: LLMRequest): Promise<AsyncIterable<StreamChunk>> {
    const body = this.buildAnthropicBody({ ...request, stream: true });

    const response = await this.withRetry(async () => {
      const res = await this.fetchWithTimeout(`${this.baseUrl}/messages`, {
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
    let currentToolCall: { id: string; name: string; arguments: string } | null = null;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;

          try {
            const data = JSON.parse(trimmed.slice(6)) as {
              type: string;
              text?: string;
              content_block?: { type: string; id?: string; name?: string; input?: Record<string, unknown>; text?: string };
              delta?: { type?: string; text?: string; partial_json?: string; stop_reason?: string };
              index?: number;
              message?: { usage?: { input_tokens: number; output_tokens: number } };
              usage?: { input_tokens: number; output_tokens: number };
            };

            if (data.type === 'content_block_start' && data.content_block?.type === 'tool_use') {
              currentToolCall = {
                id: data.content_block.id ?? '',
                name: data.content_block.name ?? '',
                arguments: '',
              };
            }

            if (data.type === 'content_block_delta') {
              if (data.delta?.type === 'text_delta' && data.delta.text) {
                yield { type: 'text', content: data.delta.text };
              }
              if (data.delta?.type === 'input_json_delta' && data.delta.partial_json && currentToolCall) {
                currentToolCall.arguments += data.delta.partial_json;
              }
            }

            if (data.type === 'content_block_stop' && currentToolCall) {
              yield {
                type: 'tool_call',
                toolCall: {
                  id: currentToolCall.id,
                  type: 'function',
                  function: {
                    name: currentToolCall.name,
                    arguments: currentToolCall.arguments,
                  },
                },
              };
              currentToolCall = null;
            }

            if (data.type === 'message_delta' || data.type === 'message_stop') {
              if (data.message?.usage || data.usage) {
                const u = (data.message?.usage ?? data.usage)!;
                yield {
                  type: 'done',
                  usage: { input: u.input_tokens, output: u.output_tokens, total: u.input_tokens + u.output_tokens },
                };
              } else {
                yield { type: 'done' };
              }
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }

      if (!currentToolCall) {
        yield { type: 'done' };
      }
    } catch (error) {
      yield { type: 'done', error: (error as Error).message };
    } finally {
      reader.releaseLock();
    }
  }

  private buildAnthropicBody(request: LLMRequest & { stream?: boolean }): AnthropicRequest {
    const systemMessages = request.messages.filter((m) => m.role === 'system');
    const nonSystemMessages = request.messages.filter((m) => m.role !== 'system');

    const system = systemMessages.map((m) => m.content).join('\n');

    const messages: AnthropicMessage[] = nonSystemMessages.map((msg) => {
      if (msg.role === 'tool') {
        return {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: msg.toolCallId,
              content: msg.content,
            } as AnthropicMessage['content'][0],
          ],
        };
      }

      const content: AnthropicMessage['content'] = [];

      if (msg.content) {
        content.push({ type: 'text', text: msg.content });
      }

      if (msg.toolCalls && msg.toolCalls.length > 0) {
        for (const tc of msg.toolCalls) {
          content.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.function.name,
            input: JSON.parse(tc.function.arguments),
          } as AnthropicMessage['content'][0]);
        }
      }

      return { role: msg.role as 'user' | 'assistant', content };
    });

    const anthropicTools = request.tools?.map((t) => ({
      name: t.function.name,
      description: t.function.description,
      input_schema: t.function.parameters,
    }));

    return {
      model: request.model,
      max_tokens: request.maxTokens ?? 4096,
      messages,
      ...(system ? { system } : {}),
      ...(anthropicTools && anthropicTools.length > 0 ? { tools: anthropicTools } : {}),
      ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
      stream: request.stream ?? false,
    };
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
