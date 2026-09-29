import { Injectable } from '@nestjs/common';
import { MessageRole, ProviderType } from '@prisma/client';
import {
  CompletionRequest,
  CompletionStreamEvent,
  ProviderCredentials,
  TokenUsage,
} from './ai-provider-adapter.interface';
import {
  HttpProviderAdapter,
  ParsedCompletion,
  ProviderRequest,
} from './http-provider.adapter';

interface GeminiUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
}

/** Same shape for a full response and for each streamed chunk. */
interface GeminiResponse {
  modelVersion?: string;
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  usageMetadata?: GeminiUsageMetadata;
}

@Injectable()
export class GeminiAdapter extends HttpProviderAdapter {
  readonly type = ProviderType.GEMINI;

  protected buildHealthCheckRequest({
    apiKey,
    baseUrl,
  }: ProviderCredentials): ProviderRequest {
    // Header rather than the `?key=` query param, so the key never ends up
    // in URL-based logs.
    return {
      url: `${this.trimTrailingSlash(baseUrl)}/models`,
      headers: { 'x-goog-api-key': apiKey },
    };
  }

  /** Gemini calls the assistant role `model`; system text is separate. */
  protected buildCompletionRequest(
    { apiKey, baseUrl }: ProviderCredentials,
    { model, messages, maxOutputTokens }: CompletionRequest,
    stream: boolean,
  ): ProviderRequest {
    const action = stream ? 'streamGenerateContent?alt=sse' : 'generateContent';
    const system = messages.filter(({ role }) => role === MessageRole.SYSTEM);
    const contents = messages
      .filter(({ role }) => role !== MessageRole.SYSTEM)
      .map(({ role, content }) => ({
        role: role === MessageRole.ASSISTANT ? 'model' : 'user',
        parts: [{ text: content }],
      }));

    return {
      url: `${this.trimTrailingSlash(baseUrl)}/models/${encodeURIComponent(model)}:${action}`,
      headers: { 'x-goog-api-key': apiKey },
      body: {
        contents,
        generationConfig: { maxOutputTokens },
        ...(system.length && {
          systemInstruction: {
            parts: system.map(({ content }) => ({ text: content })),
          },
        }),
      },
    };
  }

  protected parseCompletion(body: GeminiResponse): ParsedCompletion {
    return {
      content: this.extractText(body) || null,
      model: body.modelVersion ?? null,
      usage: this.toUsage(body.usageMetadata),
    };
  }

  /** Each chunk carries cumulative usage, so the last one wins. */
  protected parseStreamChunk(chunk: GeminiResponse): CompletionStreamEvent[] {
    const events: CompletionStreamEvent[] = [];
    const content = this.extractText(chunk);
    if (content) {
      events.push({ type: 'delta', content });
    }
    if (chunk.usageMetadata) {
      events.push({ type: 'usage', usage: this.toUsage(chunk.usageMetadata) });
    }
    return events;
  }

  private extractText(response: GeminiResponse): string {
    return (response.candidates?.[0]?.content?.parts ?? [])
      .map((part) => part.text ?? '')
      .join('');
  }

  private toUsage(usage: GeminiUsageMetadata | undefined): TokenUsage {
    return {
      promptTokens: usage?.promptTokenCount ?? null,
      completionTokens: usage?.candidatesTokenCount ?? null,
      totalTokens: usage?.totalTokenCount ?? null,
    };
  }
}
