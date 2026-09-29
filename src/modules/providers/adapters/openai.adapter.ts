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

const OPENAI_ROLES: Record<MessageRole, string> = {
  [MessageRole.SYSTEM]: 'system',
  [MessageRole.USER]: 'user',
  [MessageRole.ASSISTANT]: 'assistant',
};

interface OpenAiUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

interface OpenAiCompletionResponse {
  model?: string;
  choices?: { message?: { content?: string | null } }[];
  usage?: OpenAiUsage;
}

interface OpenAiStreamChunk {
  choices?: { delta?: { content?: string | null } }[];
  usage?: OpenAiUsage | null;
}

@Injectable()
export class OpenAiAdapter extends HttpProviderAdapter {
  readonly type = ProviderType.OPENAI;

  protected buildHealthCheckRequest({
    apiKey,
    baseUrl,
  }: ProviderCredentials): ProviderRequest {
    return {
      url: `${this.trimTrailingSlash(baseUrl)}/models`,
      headers: { Authorization: `Bearer ${apiKey}` },
    };
  }

  protected buildCompletionRequest(
    { apiKey, baseUrl }: ProviderCredentials,
    { model, messages, maxOutputTokens }: CompletionRequest,
    stream: boolean,
  ): ProviderRequest {
    return {
      url: `${this.trimTrailingSlash(baseUrl)}/chat/completions`,
      headers: { Authorization: `Bearer ${apiKey}` },
      body: {
        model,
        messages: messages.map(({ role, content }) => ({
          role: OPENAI_ROLES[role],
          content,
        })),
        max_completion_tokens: maxOutputTokens,
        // Usage is only reported for streams when asked for, in a final chunk.
        ...(stream && { stream, stream_options: { include_usage: true } }),
      },
    };
  }

  protected parseCompletion(body: OpenAiCompletionResponse): ParsedCompletion {
    return {
      content: body.choices?.[0]?.message?.content ?? null,
      model: body.model ?? null,
      usage: this.toUsage(body.usage),
    };
  }

  protected parseStreamChunk(
    chunk: OpenAiStreamChunk,
  ): CompletionStreamEvent[] {
    const events: CompletionStreamEvent[] = [];
    const content = chunk.choices?.[0]?.delta?.content;
    if (content) {
      events.push({ type: 'delta', content });
    }
    if (chunk.usage) {
      events.push({ type: 'usage', usage: this.toUsage(chunk.usage) });
    }
    return events;
  }

  private toUsage(usage: OpenAiUsage | undefined): TokenUsage {
    return {
      promptTokens: usage?.prompt_tokens ?? null,
      completionTokens: usage?.completion_tokens ?? null,
      totalTokens: usage?.total_tokens ?? null,
    };
  }
}
