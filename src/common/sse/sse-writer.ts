import { HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { SSE_CONTENT_TYPE } from '../constants/sse.constants';

export interface SseEvent {
  event: string;
  data: unknown;
}

export function formatSseEvent({ event, data }: SseEvent): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * Streams events to an Express response as Server-Sent Events.
 *
 * Headers are only sent with the first event, so anything that fails
 * before it (404, quota 429, a provider rejecting the call) still reaches
 * the global exception filter as a normal JSON error with its real status.
 * A failure after that point is written into the stream as an `error`
 * event by the same filter.
 */
export class SseWriter {
  private readonly abortController = new AbortController();

  constructor(private readonly response: Response) {
    response.on('close', () => {
      if (!response.writableFinished) {
        this.abortController.abort();
      }
    });
  }

  /** Aborted when the client disconnects before the stream finishes. */
  get signal(): AbortSignal {
    return this.abortController.signal;
  }

  async pipe(events: AsyncIterable<SseEvent>): Promise<void> {
    for await (const event of events) {
      this.openIfNeeded();
      this.response.write(formatSseEvent(event));
    }
    this.response.end();
  }

  private openIfNeeded(): void {
    if (this.response.headersSent) {
      return;
    }
    this.response.status(HttpStatus.OK).set({
      'Content-Type': SSE_CONTENT_TYPE,
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      // Stops reverse proxies (nginx) from buffering the stream.
      'X-Accel-Buffering': 'no',
    });
    this.response.flushHeaders();
  }
}
