import { AbstractProvider } from '../provider.js';
import type {
  LLMRequest,
  LLMResponse,
  StreamChunk,
  CostEstimate,
  ModelDefinition,
  ToolCall,
  ToolDefinition,
} from '../types.js';

interface GoogleContent {
  role: 'user' | 'model';
  parts: Array<{ text?: string; functionCall?: { name: string; args: Record<string, unknown> }; functionResponse?: { name: string; response: Record<string, unknown> } }>;
}

interface GoogleTool {
  functionDeclarations: Array<{
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  }>;
}

interface GoogleCandidate {
  content: GoogleContent;
  finishReason?: string;
}

interface GoogleResponse {
  candidates?: GoogleCandidate[];
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
}

interface GoogleStreamChunk {
  candidates?: GoogleCandidate[];
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
}

export class GoogleProvider extends AbstractProvider {
  constructor(config: { apiKey?: string; baseUrl?: string; enabled?: boolean; timeout?: number; retries?: number }) {
    super('google', {
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      enabled: config.enabled ?? true,
      timeout: config.timeout ?? 60_000,
      retries: config.retries ?? 3,
    });
  }

  protected getDefaultBaseUrl(): string {
    return 'https://generativelanguage.googleapis.com/v1beta';
  }

  protected getAuthHeaders(): Record<string, string> {
    return { 'Content-Type': 'application/json' };
  }

  private getUrl(model: string, stream = false): string {
    const key = this.config.apiKey ?? '';
    const endpoint = stream ? 'streamGenerateContent' : 'generateContent';
    const alt = stream ? '?alt=sse' : '';
    return `${this.baseUrl}/models/${model}:${endpoint}${alt ? `${alt}&key=${key}` : `?key=${key}`}`;
  }

  async send(request: LLMRequest): Promise<LLMResponse> {
    return this.withRetry(async () => {
      const body = this.buildGoogleBody(request);
      const url = this.getUrl(request.model, false);
      const response = await this.fetchWithTimeout(url, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw await this.buildError(response);
      }

      const data = (await response.json()) as GoogleResponse;

      return this.parseGoogleResponse(data, request.model);
    });
  }

  async stream(request: LLMRequest): Promise<AsyncIterable<StreamChunk>> {
    const body = this.buildGoogleBody(request);
    const url = this.getUrl(request.model, true);

    const response = await this.withRetry(async () => {
      const res = await this.fetchWithTimeout(url, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(body),
      });
      if (!res.ok) throw await this.buildError(res);
      return res;
    });

    return this.parseGoogleSSEStream(response, request.model);
  }

  private async *parseGoogleSSEStream(response: Response, model: string): AsyncIterable<StreamChunk> {
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
          if (!trimmed || !trimmed.startsWith('data: ')) continue;

          try {
            const data = JSON.parse(trimmed.slice(6)) as GoogleStreamChunk;

            if (data.usageMetadata) {
              yield {
                type: 'done',
                usage: {
                  input: data.usageMetadata.promptTokenCount,
                  output: data.usageMetadata.candidatesTokenCount,
                  total: data.usageMetadata.totalTokenCount,
                },
              };
              continue;
            }

            if (!data.candidates || data.candidates.length === 0) {
              continue;
            }

            const candidate = data.candidates[0]!;

            if (candidate.finishReason === 'STOP' || candidate.finishReason === 'stop') {
              yield { type: 'done' };
              continue;
            }

            const parts = candidate.content?.parts ?? [];
            for (const part of parts) {
              if (part.text) {
                yield { type: 'text', content: part.text };
              }
              if (part.functionCall) {
                yield {
                  type: 'tool_call',
                  toolCall: {
                    id: part.functionCall.name,
                    type: 'function',
                    function: {
                      name: part.functionCall.name,
                      arguments: JSON.stringify(part.functionCall.args ?? {}),
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
      yield { type: 'done' };
    } catch (error) {
      yield { type: 'done', error: (error as Error).message };
    } finally {
      reader.releaseLock();
    }
  }

  private parseGoogleResponse(data: GoogleResponse, model: string): LLMResponse {
    const textParts: string[] = [];
    const toolCalls: ToolCall[] = [];

    const candidate = data.candidates?.[0];
    if (candidate?.content?.parts) {
      for (const part of candidate.content.parts) {
        if (part.text) {
          textParts.push(part.text);
        }
        if (part.functionCall) {
          toolCalls.push({
            id: part.functionCall.name,
            type: 'function',
            function: {
              name: part.functionCall.name,
              arguments: JSON.stringify(part.functionCall.args ?? {}),
            },
          });
        }
      }
    }

    return {
      content: textParts.join(''),
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: {
        input: data.usageMetadata?.promptTokenCount ?? 0,
        output: data.usageMetadata?.candidatesTokenCount ?? 0,
        total: data.usageMetadata?.totalTokenCount ?? 0,
      },
      model,
      id: crypto.randomUUID(),
    };
  }

  private buildGoogleBody(request: LLMRequest): Record<string, unknown> {
    const contents: GoogleContent[] = [];
    let systemInstruction: string | undefined;

    for (const msg of request.messages) {
      if (msg.role === 'system') {
        systemInstruction = (systemInstruction ? systemInstruction + '\n' : '') + msg.content;
        continue;
      }

      const parts: GoogleContent['parts'] = [];

      if (msg.content) {
        parts.push({ text: msg.content });
      }

      if (msg.toolCalls && msg.toolCalls.length > 0) {
        for (const tc of msg.toolCalls) {
          parts.push({
            functionCall: {
              name: tc.function.name,
              args: JSON.parse(tc.function.arguments),
            },
          });
        }
      }

      if (msg.role === 'tool' && msg.toolCallId) {
        parts.push({
          functionResponse: {
            name: msg.toolCallId,
            response: { content: msg.content },
          },
        });
      }

      if (parts.length > 0) {
        const role = msg.role === 'assistant' ? 'model' : 'user';
        contents.push({ role, parts });
      }
    }

    const body: Record<string, unknown> = {
      contents,
    };

    if (systemInstruction) {
      body.systemInstruction = {
        parts: [{ text: systemInstruction }],
      };
    }

    if (request.tools && request.tools.length > 0) {
      body.tools = this.buildGoogleTools(request.tools);
    }

    if (request.temperature !== undefined) {
      body.generationConfig = {
        ...(body.generationConfig as Record<string, unknown> ?? {}),
        temperature: request.temperature,
      };
    }

    if (request.maxTokens !== undefined) {
      body.generationConfig = {
        ...(body.generationConfig as Record<string, unknown> ?? {}),
        maxOutputTokens: request.maxTokens,
      };
    }

    return body;
  }

  private buildGoogleTools(tools: ToolDefinition[]): GoogleTool[] {
    return tools.map((t) => ({
      functionDeclarations: [
        {
          name: t.function.name,
          description: t.function.description,
          parameters: t.function.parameters,
        },
      ],
    }));
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
