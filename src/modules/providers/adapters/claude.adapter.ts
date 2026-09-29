import { BadGatewayException, Injectable } from '@nestjs/common';
import { MessageRole, ProviderType } from '@prisma/client';
import { ANTHROPIC_API_VERSION } from '../../../common/constants/provider.constants';
import {
  CompletionRequest,
  CompletionStreamEvent,
  ProviderCredentials,
} from './ai-provider-adapter.interface';
import {
  HttpProviderAdapter,
  ParsedCompletion,
  ProviderRequest,
} from './http-provider.adapter';

interface ClaudeUsage {
  input_tokens?: number;
  output_tokens?: number;
}

interface ClaudeCompletionResponse {
  model?: string;
  content?: { type: string; text?: string }[];
  usage?: ClaudeUsage;
}

/** The subset of Messages API stream events this adapter reads. */
interface ClaudeStreamEvent {
  type: string;
  message?: { usage?: ClaudeUsage };
  delta?: { type?: string; text?: string };
  usage?: ClaudeUsage;
  error?: { type?: string; message?: string };
}

@Injectable()
export class ClaudeAdapter extends HttpProviderAdapter {
  readonly type = ProviderType.CLAUDE;

  protected buildHealthCheckRequest({
    apiKey,
    baseUrl,
  }: ProviderCredentials): ProviderRequest {
    return {
      url: `${this.trimTrailingSlash(baseUrl)}/models`,
      headers: this.authHeaders(apiKey),
    };
  }

  /** The Messages API takes system text as a top-level field, not a turn. */
  protected buildCompletionRequest(
    { apiKey, baseUrl }: ProviderCredentials,
    { model, messages, maxOutputTokens }: CompletionRequest,
    stream: boolean,
  ): ProviderRequest {
    const system = messages
      .filter(({ role }) => role === MessageRole.SYSTEM)
      .map(({ content }) => content)
      .join('\n\n');
    const turns = messages
      .filter(({ role }) => role !== MessageRole.SYSTEM)
      .map(({ role, content }) => ({
        role: role === MessageRole.ASSISTANT ? 'assistant' : 'user',
        content,
      }));

    return {
      url: `${this.trimTrailingSlash(baseUrl)}/messages`,
      headers: this.authHeaders(apiKey),
      body: {
        model,
        max_tokens: maxOutputTokens,
        messages: turns,
        ...(system && { system }),
        ...(stream && { stream }),
      },
    };
  }

  protected parseCompletion(body: ClaudeCompletionResponse): ParsedCompletion {
    const text = (body.content ?? [])
      .filter((block) => block.type === 'text')
      .map((block) => block.text ?? '')
      .join('');
    const input = body.usage?.input_tokens ?? null;
    const output = body.usage?.output_tokens ?? null;

    return {
      content: text || null,
      model: body.model ?? null,
      usage: {
        promptTokens: input,
        completionTokens: output,
        totalTokens: input !== null && output !== null ? input + output : null,
      },
    };
  }

  /**
   * Prompt tokens arrive in `message_start`, the final completion count in
   * `message_delta`. Claude can also fail mid-stream (e.g. overloaded) with
   * an `error` event even after a 200.
   */
  protected parseStreamChunk(
    event: ClaudeStreamEvent,
  ): CompletionStreamEvent[] {
    switch (event.type) {
      case 'content_block_delta':
        return event.delta?.type === 'text_delta' && event.delta.text
          ? [{ type: 'delta', content: event.delta.text }]
          : [];
      case 'message_start':
        return [
          {
            type: 'usage',
            usage: {
              promptTokens: event.message?.usage?.input_tokens ?? null,
            },
          },
        ];
      case 'message_delta':
        return [
          {
            type: 'usage',
            usage: { completionTokens: event.usage?.output_tokens ?? null },
          },
        ];
      case 'error':
        throw new BadGatewayException(
          `AI provider stream failed: ${event.error?.type ?? 'unknown error'}`,
        );
      default:
        return [];
    }
  }

  private authHeaders(apiKey: string): Record<string, string> {
    return {
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_API_VERSION,
    };
  }
}
